#!/usr/bin/env bash
# Coreward CLI statusline — reads cwd .vibe/coreward-presence.json (no daemon).
# Cursor Agent CLI (~/.cursor/cli-config.json):
#   "statusLine": { "type": "command", "command": "/abs/path/to/repo/runs/coreward-statusline.sh" }
# Claude Code: same script if your host supports a cwd-based command statusline.
set -euo pipefail

ROOT="${COREWARD_ROOT:-$(pwd)}"
PRESENCE="$ROOT/.vibe/coreward-presence.json"
MANDATE="$ROOT/.vibe/active_mandate.json"

mode="OFF"
ticket="none"
ward="LEGACY"

if [[ -f "$PRESENCE" ]]; then
  if grep -q '"mode"[[:space:]]*:[[:space:]]*"ON"' "$PRESENCE" 2>/dev/null; then
    mode="ON"
  fi
  # Non-null string ticket_id ⇒ fresh; null/missing ⇒ none (presence-bound; not full expiry scan)
  if grep -qE '"ticket_id"[[:space:]]*:[[:space:]]*"[^"]+"' "$PRESENCE" 2>/dev/null; then
    ticket="fresh"
  fi
fi

if [[ -f "$MANDATE" ]]; then
  ward="ON"
fi

printf 'Coreward Mode=%s ticket=%s Ward=%s\n' "$mode" "$ticket" "$ward"
