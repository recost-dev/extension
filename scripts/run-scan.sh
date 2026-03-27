#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  cat <<'EOF'
Usage: bash scripts/run-scan.sh <file-or-directory> [summary|json]

Examples:
  bash scripts/run-scan.sh src summary
  bash scripts/run-scan.sh src/scanner/workspace-scanner.ts summary
  bash scripts/run-scan.sh src json
EOF
  exit 1
fi

TARGET="$1"
FORMAT="${2:-summary}"

if [[ "$FORMAT" != "summary" && "$FORMAT" != "json" ]]; then
  echo "Unsupported format: $FORMAT" >&2
  exit 1
fi

cd "$ROOT_DIR"
npm run build:ext >/dev/null
npm run scan:cli -- "$TARGET" --format "$FORMAT"
