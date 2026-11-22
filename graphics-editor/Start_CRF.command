#!/bin/bash
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
CRF_BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf 'CRF needs Node.js 22 or later. Install Node.js, then run this file again.\n'
  printf 'See README_START_HERE.md for setup instructions.\n'
  read -r -p 'Press Return to close.' _crf_ack || true
  exit 1
fi
node "$CRF_BUNDLE_DIR/tools/start.mjs" "$@"
