#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SCAN_TARGET="${1:-.}"

if command -v rg >/dev/null 2>&1; then
  MATCHES="$(rg -n --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/dist-test/**' --glob '!**/build/**' --glob '!**/.next/**' --glob '!**/vendor/**' --glob '!**/__pycache__/**' --glob '!SECURITY_REPORT.md' --glob '!scripts/check-secrets.sh' 'BEGIN (RSA |EC )?PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|BEGIN DSA PRIVATE KEY' "$SCAN_TARGET" || true)"
else
  MATCHES="$(grep -RInE --exclude=SECURITY_REPORT.md --exclude=check-secrets.sh --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist-test --exclude-dir=build --exclude-dir=.next --exclude-dir=vendor --exclude-dir=__pycache__ 'BEGIN (RSA |EC )?PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|BEGIN DSA PRIVATE KEY' "$SCAN_TARGET" || true)"
fi

if [[ -n "$MATCHES" ]]; then
  echo "Potential private key material detected:"
  echo "$MATCHES"
  exit 1
fi

echo "No PEM private key headers detected in $SCAN_TARGET"
