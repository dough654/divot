#!/usr/bin/env bash
set -euo pipefail

# Local build script — syncs project to Mac, builds, and installs on device.
# The Mac acts as the dedicated build + install machine.
#
# Usage:
#   ./scripts/local-build.sh ios --device iphone
#   ./scripts/local-build.sh ios --device ipad
#   ./scripts/local-build.sh android --device s22
#   ./scripts/local-build.sh android --device s10-tablet
#   ./scripts/local-build.sh ios --profile preview --device iphone
#   ./scripts/local-build.sh android --no-install

PLATFORM="${1:?Usage: local-build.sh <ios|android> [--device <name>] [--profile <profile>] [--no-install]}"
shift

PROFILE="development"
INSTALL=true
DEVICE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --device) DEVICE="$2"; shift 2 ;;
    --no-install) INSTALL=false; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

MAC_HOST="mac"
REMOTE_DIR="~/dev/swing-app"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ---------------------------------------------------------------------------
# resolve_ios_device: find UUID for an iOS device by friendly name
# ---------------------------------------------------------------------------
resolve_ios_device() {
  local name="$1"
  local pattern
  case "${name}" in
    iphone)  pattern="iPhone" ;;
    ipad)    pattern="iPad" ;;
    *)       echo "Unknown iOS device name: ${name}" >&2; return 1 ;;
  esac

  local uuid
  uuid=$(ssh "${MAC_HOST}" "xcrun devicectl list devices 2>/dev/null | grep 'available' | grep -m1 '${pattern}' | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'" 2>/dev/null || true)

  if [[ -z "${uuid}" ]]; then
    echo "No paired iOS device matching '${pattern}' found." >&2
    return 1
  fi
  echo "${uuid}"
}

# ---------------------------------------------------------------------------
# resolve_android_device: find adb serial for an Android device by friendly name
#
# Maps friendly names to model strings from `adb devices -l`.
# To find a device's model string, run: ssh mac "adb devices -l"
# ---------------------------------------------------------------------------
resolve_android_device() {
  local name="$1"
  local model_pattern
  case "${name}" in
    s22)        model_pattern="SM_S908" ;;  # Galaxy S22 Ultra
    s10-tablet) model_pattern="SM_T" ;;     # Galaxy Tab S10 FE (update when known)
    *)          echo "Unknown Android device name: ${name}" >&2; return 1 ;;
  esac

  local serial
  serial=$(ssh "${MAC_HOST}" "adb devices -l 2>/dev/null | grep '${model_pattern}' | awk '{print \$1}'" 2>/dev/null || true)

  if [[ -z "${serial}" ]]; then
    echo "No connected Android device matching '${name}' (${model_pattern}) found." >&2
    return 1
  fi
  echo "${serial}"
}

echo "==> Syncing project to Mac..."
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.expo' \
  --exclude='/android' \
  --exclude='/ios' \
  --exclude='builds' \
  "${LOCAL_DIR}/" "${MAC_HOST}:${REMOTE_DIR}/"
echo "    Done."

echo "==> Committing changes for EAS..."
ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && git add -A && git diff-index --quiet HEAD || git commit -m 'build sync' --no-gpg-sign" 2>&1 | tail -1

echo "==> Installing dependencies on Mac..."
ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && npm ci --prefer-offline 2>&1 | tail -1"

echo "==> Running eas build --local (platform=${PLATFORM}, profile=${PROFILE})..."

EXTENSION="apk"
if [[ "${PLATFORM}" == "ios" ]]; then
  EXTENSION="ipa"
fi

ARTIFACT="build-output.${EXTENSION}"

ssh -t "${MAC_HOST}" "cd ${REMOTE_DIR} && eas build --local --platform ${PLATFORM} --profile ${PROFILE} --non-interactive --output ${ARTIFACT}"

echo ""
echo "==> Build complete!"
echo "    Artifact on Mac: ${REMOTE_DIR}/${ARTIFACT}"

if [[ "${INSTALL}" == "false" ]]; then
  exit 0
fi

echo "==> Installing on device..."
if [[ "${PLATFORM}" == "android" ]]; then
  ADB_CMD="adb"
  if [[ -n "${DEVICE}" ]]; then
    SERIAL=$(resolve_android_device "${DEVICE}")
    ADB_CMD="adb -s ${SERIAL}"
    echo "    Target: ${DEVICE} (${SERIAL})"
  fi
  ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && ${ADB_CMD} install -r ${ARTIFACT}" \
    && echo "    Installed on Android device." \
    || echo "    Install failed. Is the device connected to the Mac via USB with USB debugging enabled?"

elif [[ "${PLATFORM}" == "ios" ]]; then
  if [[ -n "${DEVICE}" ]]; then
    DEVICE_ID=$(resolve_ios_device "${DEVICE}")
  else
    # Default: iPhone preferred, falls back to iPad
    DEVICE_ID=$(ssh "${MAC_HOST}" "xcrun devicectl list devices 2>/dev/null | grep 'available' | { grep -m1 'iPhone' || grep -m1 'iPad'; } | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'" 2>/dev/null || true)
  fi

  if [[ -z "${DEVICE_ID}" ]]; then
    echo "    No connected iOS device found. Connect a device to the Mac and run:"
    echo "    ssh mac \"cd ${REMOTE_DIR} && xcrun devicectl device install app --device <DEVICE_ID> ${ARTIFACT}\""
  else
    echo "    Target: ${DEVICE:-auto-detected} (${DEVICE_ID})"
    ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && xcrun devicectl device install app --device '${DEVICE_ID}' '${ARTIFACT}'" \
      && echo "    Installed on iOS device." \
      || echo "    Install failed. You may need to trust the developer certificate on the device."
  fi
fi
