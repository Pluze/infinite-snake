#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
# An optional project-local runtime keeps this launcher independent of other projects.
if [ -d "$PWD/.runtime/node-v22.16.0-darwin-arm64/bin" ]; then
  export PATH="$PWD/.runtime/node-v22.16.0-darwin-arm64/bin:$PATH"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo 'Install Node.js 20 or newer, then try again.'
  read -r -p 'Press Enter to exit…'
  exit 1
fi
url='http://127.0.0.1:5174'
if page=$(curl --noproxy '*' --silent --fail --max-time 3 "$url/" 2>/dev/null); then
  if [[ "$page" == *'<title>Infinite Snake · Wraparound</title>'* ]]; then open "$url"; exit 0; fi
  echo 'Port 5174 is already in use by another service.'; exit 1
fi
if [ ! -d node_modules ]; then npm ci --no-audit --no-fund; fi
exec npm start
