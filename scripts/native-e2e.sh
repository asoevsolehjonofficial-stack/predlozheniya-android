#!/usr/bin/env bash
set -Eeuo pipefail

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${PACKAGE_NAME:?PACKAGE_NAME is required}"
: "${API_LEVEL:?API_LEVEL is required}"
: "${SCENARIO:?SCENARIO is required}"

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
  { echo "$ ps | grep package"; bounded 8 adb shell ps | grep -F "$PACKAGE_NAME"; echo "process_check_exit=$?"; } >> "$DIAG/process.txt" 2>&1
  { echo "$ getprop ro.build.version.release"; bounded 8 adb shell getprop ro.build.version.release; echo "$ getprop ro.build.fingerprint"; bounded 8 adb shell getprop ro.build.fingerprint; echo "$ getprop ro.hardware"; bounded 8 adb shell getprop ro.hardware; echo "$ getprop ro.kernel.qemu"; bounded 8 adb shell getprop ro.kernel.qemu; echo "$ getprop debug.hwui.renderer"; bounded 8 adb shell getprop debug.hwui.renderer; } > "$DIAG/emulator-properties.txt" 2>&1
  if bounded 8 adb shell dumpsys window windows > "$DIAG/window-dumpsys.txt" 2>&1; then
    echo "dumpsys_window=completed" >> "$DIAG/focus.txt"
    grep -E "mCurrentFocus|mFocusedApp|FocusedWindow|focusedWindow" "$DIAG/window-dumpsys.txt" >> "$DIAG/focus.txt" || true
  else
    echo "dumpsys_window=failed_or_timed_out; using uiautomator fallback" >> "$DIAG/focus.txt"
    if bounded 10 adb shell uiautomator dump --compressed /data/local/tmp/native-e2e-window.xml > "$DIAG/uiautomator-dump-command.txt" 2>&1; then
      bounded 8 adb shell cat /data/local/tmp/native-e2e-window.xml > "$DIAG/uiautomator-window.xml" 2>&1
      grep -E "$PACKAGE_NAME|focused=\"true\"|hierarchy" "$DIAG/uiautomator-window.xml" >> "$DIAG/focus.txt" || true
    fi
  fi
  bounded 10 adb logcat -d -t 500 > "$DIAG/logcat-tail.txt" 2>&1
  echo "diagnostics collected; exit=$rc" >&2
}
trap collect_diagnostics EXIT

case "$SCENARIO" in
  simple) EXPECTED_SCREEN_TEXT='Count|ADD ONE' ;;
  multi-screen) EXPECTED_SCREEN_TEXT='Home screen|OPEN SETTINGS' ;;
  storage) EXPECTED_SCREEN_TEXT='Write a note|SAVE NOTE' ;;
  *) echo "::error::Unknown SCENARIO: $SCENARIO"; exit 2 ;;
esac
echo "Scenario=$SCENARIO; expected screen text regex=$EXPECTED_SCREEN_TEXT"
echo "Waiting for adb device (API $API_LEVEL)."
BOOT_START="$(date +%s)"
bounded 30 adb wait-for-device
echo "adb wait-for-device completed."
BOOT_READY=0
for attempt in $(seq 1 60); do
  BOOT_STATE="$(bounded 8 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  printf 'Boot readiness probe %s/60: getprop sys.boot_completed returned <%s>\n' "$attempt" "$BOOT_STATE"
  if [[ "$BOOT_STATE" == "1" ]]; then
    BOOT_READY=1
    BOOT_ELAPSED="$(( $(date +%s) - BOOT_START ))"
    echo "ANDROID_BOOT_READY api=$API_LEVEL sys.boot_completed=$BOOT_STATE attempt=$attempt elapsed_seconds=$BOOT_ELAPSED"
    break
  fi
  sleep 5
done
[[ "$BOOT_READY" -eq 1 ]] || { echo "::error::Emulator boot did not complete within 300 seconds after adb wait-for-device."; exit 1; }
PM_READY=0
for attempt in $(seq 1 12); do
  if bounded 8 adb shell pm path android 2>&1 | grep -q '^package:'; then PM_READY=1; echo "Package Manager ready: pm path android"; break; fi
  sleep 5
done
[[ "$PM_READY" -eq 1 ]] || { echo "::error::Package Manager did not become ready (pm path android)."; exit 1; }
bounded 8 adb shell settings put global window_animation_scale 0
bounded 8 adb shell settings put global transition_animation_scale 0
bounded 8 adb shell settings put global animator_duration_scale 0
echo "Animations disabled; returning to HOME before launching test app."
bounded 15 adb shell input keyevent KEYCODE_HOME
LAUNCHER_SETTLED=0
for attempt in $(seq 1 8); do
  sleep 2
  if bounded 8 adb shell dumpsys window windows > "$DIAG/launcher-settle.txt" 2>&1 &&
     grep -Eiq 'mCurrentFocus|mFocusedApp|FocusedWindow' "$DIAG/launcher-settle.txt" &&
     grep -Eiq 'com\\.google\\.android\\.apps\\.nexuslauncher|com\\.android\\.launcher|com\\.android\\.systemui' "$DIAG/launcher-settle.txt"; then
    LAUNCHER_SETTLED=1
    echo "Launcher settled after HOME (probe $attempt/8)."
    break
  fi
  echo "Launcher settling probe $attempt/8; waiting."
done
[[ "$LAUNCHER_SETTLED" -eq 1 ]] || echo "::warning::Launcher focus not conclusively observed; continuing with strict app focus/text gates."
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

# Inspect ANR dialogs without ever dismissing the tested app's own dialog.
handle_anr_dialog() {
  local label="$1" remote="/data/local/tmp/native-e2e-anr-$1.xml"
  if ! bounded 10 adb shell uiautomator dump --compressed "$remote" > "$DIAG/anr-dump-$label.txt" 2>&1; then
    echo "ANR_DIALOG_CHECK label=$label dump=unavailable"
    return 0
  fi
  if ! bounded 8 adb shell cat "$remote" > "$DIAG/anr-window-$label.xml" 2>&1; then
    echo "ANR_DIALOG_CHECK label=$label read=unavailable"
    return 0
  fi
  local xml="$DIAG/anr-window-$label.xml"
  if ! grep -Eiq "isn.t responding|is not responding" "$xml"; then return 0; fi
  local owner
  owner="$(python3 - "$xml" <<'PY'
import re, sys
s=open(sys.argv[1], encoding="utf-8", errors="replace").read()
m=re.search(r'<node[^>]*package="([^"]+)"[^>]*text="[^"]*(?:isn.t responding|is not responding)', s, re.I)
if not m:
    m=re.search(r'<node[^>]*text="[^"]*(?:isn.t responding|is not responding)[^"]*"[^>]*package="([^"]+)"', s, re.I)
print(m.group(1) if m else "")
PY
)"
  echo "ANR_DIALOG_DETECTED label=$label owner=${owner:-unknown}"
  if [[ "$owner" == "$PACKAGE_NAME" ]]; then
    echo "::error::Generated app ANR dialog detected for $PACKAGE_NAME; failing without dismissing it."
    return 2
  fi
  case "$owner" in
    com.google.android.apps.nexuslauncher|com.android.systemui|com.android.launcher*|com.google.android.launcher*|com.android.*launcher*|com.google.android.*systemui*)
      local bounds
      bounds="$(python3 - "$xml" <<'PY'
import re, sys
s=open(sys.argv[1], encoding="utf-8", errors="replace").read()
for node in re.findall(r'<node\\b[^>]*>', s):
    if re.search(r'text="\\s*Wait\\s*"', node, re.I) or re.search(r'content-desc="\\s*Wait\\s*"', node, re.I):
        m=re.search(r'bounds="\\[([0-9]+),([0-9]+)\\]\\[([0-9]+),([0-9]+)\\]"', node)
        if m:
            x1,y1,x2,y2=map(int,m.groups()); print((x1+x2)//2,(y1+y2)//2); break
PY
)"
      if [[ -z "$bounds" ]]; then
        echo "::error::System-owned ANR dialog detected but Wait button bounds were not found; refusing to close dialog."
        return 1
      fi
      echo "SYSTEM_ANR_WAIT owner=$owner bounds=$bounds"
      bounded 8 adb shell input tap $bounds
      sleep 3
      return 0
      ;;
    *)
      echo "::error::ANR dialog detected with non-system/unknown owner '${owner:-unknown}'; leaving it untouched and failing."
      return 1
      ;;
  esac
}

focus_check() {
  local attempt="$1" out="$DIAG/focus-attempt-$1.txt"
  handle_anr_dialog "$attempt" || return $?
  if bounded 8 adb shell dumpsys window windows > "$out" 2>&1; then
    if grep -E "mCurrentFocus|mFocusedApp|FocusedWindow|focusedWindow" "$out" | grep -F "$PACKAGE_NAME" >/dev/null; then
      echo "attempt=$attempt focus=confirmed_by_dumpsys" | tee -a "$DIAG/focus.txt"; return 0
    fi
  else echo "attempt=$attempt dumpsys=failed_or_timed_out" >> "$DIAG/focus.txt"; fi
  local xml="/data/local/tmp/native-e2e-window-$attempt.xml"
  if bounded 10 adb shell uiautomator dump --compressed "$xml" > "$DIAG/uiautomator-attempt-$attempt.txt" 2>&1 && bounded 8 adb shell cat "$xml" > "$DIAG/uiautomator-attempt-$attempt.xml" 2>&1 && grep -F "$PACKAGE_NAME" "$DIAG/uiautomator-attempt-$attempt.xml" >/dev/null && grep -Eiq "$EXPECTED_SCREEN_TEXT" "$DIAG/uiautomator-attempt-$attempt.xml"; then
    echo "attempt=$attempt focus=confirmed_by_uiautomator_package_and_expected_text" | tee -a "$DIAG/focus.txt"; return 0
  fi
  echo "attempt=$attempt focus=not_confirmed" | tee -a "$DIAG/focus.txt"; return 1
}

ui_text_check() {
  local attempt="$1" xml="/data/local/tmp/native-e2e-screen-$1.xml"
  handle_anr_dialog "screen-$attempt" || return $?
  if ! bounded 10 adb shell uiautomator dump --compressed "$xml" > "$DIAG/uiautomator-screen-$attempt.txt" 2>&1; then
    echo "attempt=$attempt uiautomator_dump=failed" | tee -a "$DIAG/focus.txt"; return 1
  fi
  if ! bounded 8 adb shell cat "$xml" > "$DIAG/uiautomator-screen-$attempt.xml" 2>&1; then
    echo "attempt=$attempt uiautomator_read=failed" | tee -a "$DIAG/focus.txt"; return 1
  fi
  echo "UI hierarchy text for attempt $attempt:"
  python3 - "$DIAG/uiautomator-screen-$attempt.xml" <<'PY'
import html, re, sys
from pathlib import Path
xml = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
values = []
for match in re.finditer(r'(?:text|content-desc)="([^"]*)"', xml):
    value = html.unescape(match.group(1)).strip()
    if value and value not in values:
        values.append(value)
for value in values:
    print("UI_TEXT:", value)
if not values:
    print("UI_TEXT: <no text/content-desc attributes found>")
PY
  if ! grep -F "$PACKAGE_NAME" "$DIAG/uiautomator-screen-$attempt.xml" >/dev/null; then
    echo "attempt=$attempt ui_package=missing" | tee -a "$DIAG/focus.txt"; return 1
  fi
  if ! grep -Eiq "$EXPECTED_SCREEN_TEXT" "$DIAG/uiautomator-screen-$attempt.xml"; then
    echo "attempt=$attempt ui_expected_text=missing expected=$EXPECTED_SCREEN_TEXT" | tee -a "$DIAG/focus.txt"; return 1
  fi
  echo "attempt=$attempt ui_package=present expected_screen_text=present expected=$EXPECTED_SCREEN_TEXT" | tee -a "$DIAG/focus.txt"
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
  if ! bounded 8 adb shell ps | grep -F "$PACKAGE_NAME" > "$DIAG/process-attempt-$attempt.txt" 2>&1; then
    echo "App process missing; relaunching." | tee -a "$DIAG/process.txt"
    bounded 30 adb shell am start -W -n "$PACKAGE_NAME/tj.as.generated.MainActivity" || true
  fi
  if focus_check "$attempt"; then FOCUS_CHECK_OK=1; else FOCUS_CHECK_OK=0; fi
  if ui_text_check "$attempt"; then UI_TEXT_OK=1; else UI_TEXT_OK=0; fi
  if [[ "$FOCUS_CHECK_OK" -eq 1 && "$UI_TEXT_OK" -eq 1 ]]; then
    FOCUS_OK=1
  else
    echo "Window focus/text not confirmed; requesting app launch again."
    bounded 30 adb shell am start -W -n "$PACKAGE_NAME/tj.as.generated.MainActivity" || true
    sleep 1
    if focus_check "${attempt}b"; then FOCUS_CHECK_OK=1; else FOCUS_CHECK_OK=0; fi
    if ui_text_check "${attempt}b"; then UI_TEXT_OK=1; else UI_TEXT_OK=0; fi
    if [[ "$FOCUS_CHECK_OK" -eq 1 && "$UI_TEXT_OK" -eq 1 ]]; then FOCUS_OK=1; fi
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
bounded 8 adb shell ps | grep -F "$PACKAGE_NAME" >/dev/null || { echo "::error::Generated app process is not alive after screenshot capture."; exit 1; }
echo "Native E2E screenshot checks passed for API $API_LEVEL."
