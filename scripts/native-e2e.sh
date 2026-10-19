#!/usr/bin/env bash
set -Eeuo pipefail

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${PACKAGE_NAME:?PACKAGE_NAME is required}"
: "${API_LEVEL:?API_LEVEL is required}"
: "${EXPECTED_SCREEN_TEXT:?EXPECTED_SCREEN_TEXT is required}"

APK="$GITHUB_WORKSPACE/native-builder/app/build/outputs/apk/debug/app-debug.apk"
DIAG="$RUNNER_TEMP/native-e2e-diagnostics"
SHOT="$RUNNER_TEMP/native-e2e.png"
mkdir -p "$DIAG"
: > "$DIAG/process.txt"
: > "$DIAG/focus.txt"
: > "$DIAG/emulator-properties.txt"

bounded() { local seconds="$1"; shift; timeout "${seconds}s" "$@"; }

collect_diagnostics() {
  local rc=$?
  set +e
  { echo "exit_code=$rc"; echo "api_level=$API_LEVEL"; echo "package_name=$PACKAGE_NAME"; echo "timestamp_utc=$(date -u +%FT%TZ)"; } > "$DIAG/summary.txt"
  { echo "$ pidof"; bounded 8 adb shell pidof "$PACKAGE_NAME"; echo "pidof_exit=$?"; } >> "$DIAG/process.txt" 2>&1
  { echo "$ getprop ro.build.version.release"; bounded 8 adb shell getprop ro.build.version.release; echo "$ getprop ro.build.fingerprint"; bounded 8 adb shell getprop ro.build.fingerprint; echo "$ getprop ro.hardware"; bounded 8 adb shell getprop ro.hardware; echo "$ getprop ro.kernel.qemu"; bounded 8 adb shell getprop ro.kernel.qemu; echo "$ getprop debug.hwui.renderer"; bounded 8 adb shell getprop debug.hwui.renderer; } > "$DIAG/emulator-properties.txt" 2>&1
  if bounded 8 adb shell dumpsys window windows > "$DIAG/window-dumpsys.txt" 2>&1; then
    echo "dumpsys_window=completed" >> "$DIAG/focus.txt"
    grep -E "mCurrentFocus|mFocusedApp|FocusedWindow|focusedWindow" "$DIAG/window-dumpsys.txt" >> "$DIAG/focus.txt" || true
  else
    echo "dumpsys_window=failed_or_timed_out; using uiautomator fallback" >> "$DIAG/focus.txt"
    if bounded 10 adb shell uiautomator dump --compressed /sdcard/native-e2e-window.xml > "$DIAG/uiautomator-dump-command.txt" 2>&1; then
      bounded 8 adb shell cat /sdcard/native-e2e-window.xml > "$DIAG/uiautomator-window.xml" 2>&1
      grep -E "$PACKAGE_NAME|focused=\"true\"|hierarchy" "$DIAG/uiautomator-window.xml" >> "$DIAG/focus.txt" || true
    fi
  fi
  bounded 10 adb logcat -d -t 500 > "$DIAG/logcat-tail.txt" 2>&1
  echo "diagnostics collected; exit=$rc" >&2
}
trap collect_diagnostics EXIT

echo "Waiting for Android boot and package manager (API $API_LEVEL)."
BOOT_READY=0
for attempt in $(seq 1 60); do
  BOOT_STATE="$(bounded 8 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r' || true)"
  if [[ "$BOOT_STATE" == "1" ]]; then BOOT_READY=1; echo "sys.boot_completed=1 after attempt $attempt"; break; fi
  sleep 5
done
[[ "$BOOT_READY" -eq 1 ]] || { echo "::error::Emulator boot did not complete within 300 seconds."; exit 1; }
PM_READY=0
for attempt in $(seq 1 12); do
  if bounded 8 adb shell pm path android 2>&1 | grep -q '^package:'; then PM_READY=1; echo "Package Manager ready: pm path android"; break; fi
  sleep 5
done
[[ "$PM_READY" -eq 1 ]] || { echo "::error::Package Manager did not become ready (pm path android)."; exit 1; }
bounded 8 adb shell settings put global window_animation_scale 0
bounded 8 adb shell settings put global transition_animation_scale 0
bounded 8 adb shell settings put global animator_duration_scale 0
echo "Installing generated APK on API $API_LEVEL."
INSTALL_OK=0
for attempt in 1 2 3; do
  if bounded 120 adb install -r "$APK"; then INSTALL_OK=1; echo "adb install succeeded on attempt $attempt"; break; fi
  echo "adb install attempt $attempt/3 failed; retrying after 5 seconds."
  [[ "$attempt" -lt 3 ]] && sleep 5
done
[[ "$INSTALL_OK" -eq 1 ]] || { echo "::error::adb install failed after 3 attempts."; exit 1; }
echo "Launching generated app."
bounded 45 adb shell am start -W -n "$PACKAGE_NAME/tj.as.generated.MainActivity"
sleep 2

focus_check() {
  local attempt="$1" out="$DIAG/focus-attempt-$1.txt"
  if bounded 8 adb shell dumpsys window windows > "$out" 2>&1; then
    if grep -E "mCurrentFocus|mFocusedApp|FocusedWindow|focusedWindow" "$out" | grep -F "$PACKAGE_NAME" >/dev/null; then
      echo "attempt=$attempt focus=confirmed_by_dumpsys" | tee -a "$DIAG/focus.txt"; return 0
    fi
  else echo "attempt=$attempt dumpsys=failed_or_timed_out" >> "$DIAG/focus.txt"; fi
  local xml="/sdcard/native-e2e-window-$attempt.xml"
  if bounded 10 adb shell uiautomator dump --compressed "$xml" > "$DIAG/uiautomator-attempt-$attempt.txt" 2>&1 && bounded 8 adb shell cat "$xml" > "$DIAG/uiautomator-attempt-$attempt.xml" 2>&1 && grep -F "$PACKAGE_NAME" "$DIAG/uiautomator-attempt-$attempt.xml" >/dev/null && grep -Eiq "$EXPECTED_SCREEN_TEXT" "$DIAG/uiautomator-attempt-$attempt.xml"; then
    echo "attempt=$attempt focus=confirmed_by_uiautomator_package_and_expected_text" | tee -a "$DIAG/focus.txt"; return 0
  fi
  echo "attempt=$attempt focus=not_confirmed" | tee -a "$DIAG/focus.txt"; return 1
}

ui_text_check() {
  local attempt="$1" xml="/sdcard/native-e2e-screen-$1.xml"
  if ! bounded 10 adb shell uiautomator dump --compressed "$xml" > "$DIAG/uiautomator-screen-$attempt.txt" 2>&1; then
    echo "attempt=$attempt uiautomator_dump=failed" | tee -a "$DIAG/focus.txt"; return 1
  fi
  if ! bounded 8 adb shell cat "$xml" > "$DIAG/uiautomator-screen-$attempt.xml" 2>&1; then
    echo "attempt=$attempt uiautomator_read=failed" | tee -a "$DIAG/focus.txt"; return 1
  fi
  if ! grep -F "$PACKAGE_NAME" "$DIAG/uiautomator-screen-$attempt.xml" >/dev/null; then
    echo "attempt=$attempt ui_package=missing" | tee -a "$DIAG/focus.txt"; return 1
  fi
  if ! grep -Eiq "$EXPECTED_SCREEN_TEXT" "$DIAG/uiautomator-screen-$attempt.xml"; then
    echo "attempt=$attempt ui_expected_text=missing expected=$EXPECTED_SCREEN_TEXT" | tee -a "$DIAG/focus.txt"; return 1
  fi
  echo "attempt=$attempt ui_package=present expected_screen_text=present" | tee -a "$DIAG/focus.txt"
  return 0
}

image_check() {
  python3 - "$1" "$2" <<'PY'
import json, os, sys
from PIL import Image
import numpy as np
path, out = sys.argv[1:]
im = Image.open(path).convert("RGB")
arr = np.asarray(im, dtype=np.uint8)
lum = arr.mean(axis=2)
nonblack = float((lum > 10).mean())
contrast = float(lum.std())
unique = int(len(np.unique(arr.reshape(-1, 3), axis=0)))
result = {"width": int(im.width), "height": int(im.height), "bytes": os.path.getsize(path), "nonblack_ratio_luma_gt_10": round(nonblack, 6), "luminance_stddev": round(contrast, 4), "unique_rgb_colors": unique, "min_channel": int(arr.min()), "max_channel": int(arr.max()), "passed": bool(nonblack >= 0.01 and contrast >= 5.0 and unique >= 8)}
with open(out, "w", encoding="utf-8") as f: json.dump(result, f, indent=2)
print(json.dumps(result, sort_keys=True))
if not result["passed"]: raise SystemExit("Screenshot failed real-content validation (blank/black/near-uniform frame).")
PY
}

for attempt in 1 2 3 4 5; do
  echo "Screenshot attempt $attempt/5."
  FOCUS_OK=0
  if ! bounded 8 adb shell pidof "$PACKAGE_NAME" > "$DIAG/process-attempt-$attempt.txt" 2>&1; then
    echo "App process missing; relaunching." | tee -a "$DIAG/process.txt"
    bounded 30 adb shell am start -W -n "$PACKAGE_NAME/tj.as.generated.MainActivity" || true
  fi
  if focus_check "$attempt" && ui_text_check "$attempt"; then
    FOCUS_OK=1
  else
    echo "Window focus not confirmed; requesting app launch again."
    bounded 30 adb shell am start -W -n "$PACKAGE_NAME/tj.as.generated.MainActivity" || true
    sleep 1
    if focus_check "${attempt}b" && ui_text_check "${attempt}b"; then FOCUS_OK=1; fi
  fi
  sleep 2
  if bounded 20 adb exec-out screencap -p > "$SHOT.tmp" 2> "$DIAG/screencap-attempt-$attempt.txt" && test -s "$SHOT.tmp" && file "$SHOT.tmp" | grep -qi "PNG image"; then
    mv "$SHOT.tmp" "$SHOT"
    if image_check "$SHOT" "$DIAG/pixel-stats-attempt-$attempt.json"; then
      if [[ "$FOCUS_OK" -eq 1 ]]; then
        cp "$DIAG/pixel-stats-attempt-$attempt.json" "$DIAG/pixel-stats.json"
        echo "Screenshot contains a nonblank rendered frame and app focus was confirmed."
        break
      else
        echo "attempt=$attempt pixel_content=valid focus=unconfirmed; retrying" | tee -a "$DIAG/focus.txt"
      fi
    fi
  else echo "attempt=$attempt screenshot=capture_failed" | tee -a "$DIAG/pixel-stats.txt"; fi
  rm -f "$SHOT.tmp"
  if [[ "$attempt" -lt 5 ]]; then sleep 2; fi
done

if [[ ! -s "$SHOT" ]] || [[ ! -s "$DIAG/pixel-stats.json" ]]; then echo "::error::No verified app-focused, nonblank screenshot after 5 attempts; see native-e2e-diagnostics artifact."; exit 1; fi

echo "Checking recent logs for an app crash."
bounded 15 adb logcat -d -t 500 > "$DIAG/logcat-tail.txt"
if grep -E "FATAL EXCEPTION.*$PACKAGE_NAME|Process: $PACKAGE_NAME.*died|ANR in $PACKAGE_NAME" "$DIAG/logcat-tail.txt"; then echo "::error::Generated app crashed or entered ANR."; exit 1; fi
bounded 8 adb shell pidof "$PACKAGE_NAME" >/dev/null || { echo "::error::Generated app process is not alive after screenshot capture."; exit 1; }
echo "Native E2E screenshot checks passed for API $API_LEVEL."
