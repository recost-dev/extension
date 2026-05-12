#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs npm dependencies for the three workspaces (root extension,
# webview, dashboard) so tests, type-checks, and builds can run.
set -euo pipefail

# Only run in remote (Claude Code on the web) environments.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

install_workspace() {
  local dir="$1"
  if [ ! -f "$dir/package.json" ]; then
    echo "skip: $dir (no package.json)"
    return 0
  fi
  echo "==> npm install in $dir"
  (cd "$dir" && npm install --no-audit --no-fund --loglevel=error)
}

install_workspace "$ROOT"
install_workspace "$ROOT/webview"
install_workspace "$ROOT/dashboard"

echo "SessionStart hook complete."
