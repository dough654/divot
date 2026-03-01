#!/usr/bin/env bash
set -euo pipefail

# Install the latest build artifact onto a device (no rebuild).
# Assumes a previous build left build-output.{ipa,apk} on the Mac.
#
# Usage:
#   ./scripts/local-install.sh ios --device iphone
#   ./scripts/local-install.sh ios --device ipad
#   ./scripts/local-install.sh android --device s22
#   ./scripts/local-install.sh android --device s10-tablet

PLATFORM="${1:?Usage: local-install.sh <ios|android> [--device <name>]}"
shift

DEVICE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

MAC_HOST="mac"
REMOTE_DIR="~/dev/swing-app"

# ---------------------------------------------------------------------------
# resolve_ios_device: find UUID for an iOS device by friendly name
# ---------------------------------------------------------------------------
resolve_ios_device() {
  local name="$1"

  # Devices with hardcoded UDIDs (not visible to devicectl)
  case "${name}" in
    ipad-pro) echo "4b99c110653490a52fe22ecee6a5be45894a095f"; return 0 ;;
  esac

  local pattern
  case "${name}" in
    iphone)   pattern="iPhone" ;;
    ipad)     pattern="iPad" ;;
    *)        echo "Unknown iOS device name: ${name}" >&2; return 1 ;;
  esac

  local uuid
  uuid=$(ssh "${MAC_HOST}" "xcrun devicectl list devices 2>/dev/null | grep -E 'available|connected' | grep -m1 '${pattern}' | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'" 2>/dev/null || true)

  if [[ -z "${uuid}" ]]; then
    echo "No paired iOS device matching '${pattern}' found." >&2
    return 1
  fi
  echo "${uuid}"
}

# ---------------------------------------------------------------------------
# resolve_android_device: find adb serial for an Android device by friendly name
# ---------------------------------------------------------------------------
resolve_android_device() {
  local name="$1"
  local model_pattern
  case "${name}" in
    s22)        model_pattern="SM_S908" ;;
    s10-tablet) model_pattern="SM_X52" ;;    # Galaxy Tab S10 FE
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

# ---------------------------------------------------------------------------

EXTENSION="apk"
if [[ "${PLATFORM}" == "ios" ]]; then
  EXTENSION="ipa"
fi
ARTIFACT="build-output.${EXTENSION}"

# Check that the artifact exists on the Mac
if ! ssh "${MAC_HOST}" "test -f ${REMOTE_DIR}/${ARTIFACT}"; then
  echo "No build artifact found at ${REMOTE_DIR}/${ARTIFACT} on Mac."
  echo "Run ./scripts/local-build.sh ${PLATFORM} first."
  exit 1
fi

echo "==> Installing ${ARTIFACT} on device..."
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
    DEVICE_ID=$(ssh "${MAC_HOST}" "xcrun devicectl list devices 2>/dev/null | grep -E 'available|connected' | { grep -m1 'iPhone' || grep -m1 'iPad'; } | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'" 2>/dev/null || true)
  fi

  if [[ -z "${DEVICE_ID}" ]]; then
    echo "    No connected iOS device found. Connect a device to the Mac and run:"
    echo "    ssh mac \"cd ${REMOTE_DIR} && xcrun devicectl device install app --device <DEVICE_ID> ${ARTIFACT}\""
  else
    echo "    Target: ${DEVICE:-auto-detected} (${DEVICE_ID})"
    # Old-style UDIDs (40 hex chars) aren't supported by devicectl — use ios-deploy
    if [[ "${DEVICE_ID}" =~ ^[0-9a-f]{40}$ ]]; then
      ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && ios-deploy --id '${DEVICE_ID}' --bundle '${ARTIFACT}'" \
        && echo "    Installed on iOS device." \
        || echo "    Install failed. Make sure ios-deploy is installed (brew install ios-deploy) and the device is connected."
    else
      ssh "${MAC_HOST}" "cd ${REMOTE_DIR} && xcrun devicectl device install app --device '${DEVICE_ID}' '${ARTIFACT}'" \
        && echo "    Installed on iOS device." \
        || echo "    Install failed. You may need to trust the developer certificate on the device."
    fi
  fi
fi
