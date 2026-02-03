#!/usr/bin/env bash
set -euo pipefail

# Local build script — syncs project to Mac, builds, and installs on device.
# The Mac acts as the dedicated build + install machine.
#
# Usage:
#   ./scripts/local-build.sh ios
#   ./scripts/local-build.sh android
#   ./scripts/local-build.sh ios --profile preview
#   ./scripts/local-build.sh android --no-install

PLATFORM="${1:?Usage: local-build.sh <ios|android> [--profile <profile>] [--no-install]}"
shift

PROFILE="development"
INSTALL=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --no-install) INSTALL=false; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

MAC_HOST="mac"
REMOTE_DIR="~/dev/swing-app"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Syncing project to Mac..."
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.expo' \
  --exclude='android' \
  --exclude='ios' \
  --exclude='builds' \
  "${LOCAL_DIR}/" "${MAC_HOST}:${REMOTE_DIR}/"
echo "    Done."

echo "==> Committing changes for EAS..."
ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && git add -A && git diff-index --quiet HEAD || git commit -m 'build sync' --no-gpg-sign" 2>&1 | tail -1

echo "==> Installing dependencies on Mac..."
ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && npm ci --prefer-offline 2>&1 | tail -1"

echo "==> Running eas build --local (platform=${PLATFORM}, profile=${PROFILE})..."
echo "    This will take a few minutes."

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
  ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && adb install -r ${ARTIFACT}" \
    && echo "    Installed on Android device." \
    || echo "    Install failed. Is the device connected to the Mac via USB with USB debugging enabled?"
elif [[ "${PLATFORM}" == "ios" ]]; then
  # Detect the first paired iOS device (iPhone preferred, falls back to iPad)
  DEVICE_ID=$(ssh "${MAC_HOST}" "xcrun devicectl list devices 2>/dev/null | grep 'available' | { grep -m1 'iPhone' || grep -m1 'iPad'; } | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'" 2>/dev/null || true)
  if [[ -z "${DEVICE_ID}" ]]; then
    echo "    No connected iOS device found. Connect a device to the Mac and run:"
    echo "    ssh mac \"cd ${REMOTE_DIR} && xcrun devicectl device install app --device <DEVICE_ID> ${ARTIFACT}\""
  else
    ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && xcrun devicectl device install app --device '${DEVICE_ID}' '${ARTIFACT}'" \
      && echo "    Installed on iOS device (${DEVICE_ID})." \
      || echo "    Install failed. You may need to trust the developer certificate on the device."
  fi
fi
