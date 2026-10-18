#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/index.html"
TARGET="$ROOT/app/src/main/assets/index.html"

if [[ ! -f "$SOURCE" ]]; then
  echo "ERROR: canonical source not found: $SOURCE" >&2
  exit 2
fi
mkdir -p "$(dirname "$TARGET")"

case "${1:-sync}" in
  sync)
    cp "$SOURCE" "$TARGET"
    echo "Synchronized Android WebView asset from root index.html."
    ;;
  --check)
    if cmp -s "$SOURCE" "$TARGET"; then
      echo "PASS: Android WebView asset matches root index.html."
    else
      echo "ERROR: Android WebView asset drift detected." >&2
      diff -u "$SOURCE" "$TARGET" || true
      echo "Run: bash scripts/sync-assets.sh" >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 [sync|--check]" >&2
    exit 2
    ;;
esac
