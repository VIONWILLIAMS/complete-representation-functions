#!/bin/bash
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
CRF_UPGRADE_DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf 'CRF needs Node.js 22 or later. See README_1_1.md.\n'
  exit 1
fi
node "$CRF_UPGRADE_DIR/tools/start11.mjs" "$@"
