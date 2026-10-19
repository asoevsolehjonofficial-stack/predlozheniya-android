#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${PACKAGE_NAME:?PACKAGE_NAME is required}"
: "${API_LEVEL:?API_LEVEL is required}"

APK="$GITHUB_WORKSPACE/native-builder/app/build/outputs/apk/debug/app-debug.apk"
echo "Installing generated APK on API $API_LEVEL."
timeout 120s adb install "$APK"
echo "Launching generated app."
timeout 45s adb shell am start -W -n "$PACKAGE_NAME/tj.as.generated.MainActivity"
sleep 3
echo "Verifying app process."
timeout 20s adb shell pidof "$PACKAGE_NAME"
echo "Capturing real emulator screenshot directly to the runner."
timeout 60s adb exec-out screencap -p > "$RUNNER_TEMP/native-e2e.png"
test -s "$RUNNER_TEMP/native-e2e.png"
file "$RUNNER_TEMP/native-e2e.png" | grep -qi "PNG image"
echo "Checking recent logs for an app crash."
timeout 20s adb logcat -d -t 300 > "$RUNNER_TEMP/logcat.txt"
if grep -E "FATAL EXCEPTION.*$PACKAGE_NAME|Process: $PACKAGE_NAME.*died" "$RUNNER_TEMP/logcat.txt"; then
  echo "::error::Generated app crashed."
  exit 1
fi
