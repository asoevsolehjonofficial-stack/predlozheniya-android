#!/usr/bin/env bash
set -euo pipefail

: "${API_LEVEL:?API_LEVEL is required}"
: "${SCENARIO:?SCENARIO is required}"

log_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
first_log="$log_dir/native-e2e-attempt-1.log"
second_log="$log_dir/native-e2e-attempt-2.log"

# Capture the native test's true exit status directly; do not use a pipeline.
set +e
bash scripts/native-e2e.sh >"$first_log" 2>&1
rc=$?
set -e
cat "$first_log"

if (( rc != 0 )) && grep -Eiq 'Failure calling service .*Broken pipe|Broken pipe.*32|Emulator process .*killed|Emulator boot did not complete|adb.*device offline' "$first_log"; then
  echo "EXPLICIT_EMULATOR_FAILURE_RETRY reason=matched explicit emulator/ADB failure in first attempt; retry=1/1; rerunning the entire native-e2e.sh scenario."
  rm -rf "$log_dir/native-e2e-diagnostics" "$log_dir/native-e2e.png" "$log_dir/native-e2e.png.tmp"
  set +e
  bash scripts/native-e2e.sh >"$second_log" 2>&1
  rc=$?
  set -e
  cat "$second_log"
fi

exit "$rc"
