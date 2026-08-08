#!/usr/bin/env bash
# Coreward soft reminder — fail-open. Not an IDE sandbox.
# Reminds agents when Mode is ON and no fresh authorize ticket is present.
set -euo pipefail

# Always fail-open on parse/read errors
_allow() {
  echo '{"permission":"allow"}'
  exit 0
}

# Drain stdin (hook payload) — we only inspect local Mode/ticket state
cat >/dev/null || true

ROOT="$(pwd)"
MODE_FILE="$ROOT/.vibe/coreward-mode.json"
TICKETS_DIR="$ROOT/.vibe/authorize-tickets"

mode_on=0
if [[ "${COREWARD_MODE:-}" == "1" || "${COREWARD_MODE:-}" == "true" || "${COREWARD_MODE:-}" == "yes" ]]; then
  mode_on=1
elif [[ -f "$MODE_FILE" ]]; then
  if grep -q '"enabled"[[:space:]]*:[[:space:]]*true' "$MODE_FILE" 2>/dev/null; then
    mode_on=1
  fi
fi

if [[ "$mode_on" -ne 1 ]]; then
  _allow
fi

has_fresh=0
now_epoch="$(date +%s)"
if [[ -d "$TICKETS_DIR" ]]; then
  for f in "$TICKETS_DIR"/aw_*.json; do
    [[ -f "$f" ]] || continue
    # Skip tickets that still require human /approve
    if grep -q '"requires_approval"[[:space:]]*:[[:space:]]*true' "$f" 2>/dev/null; then
      continue
    fi
    exp="$(grep -o '"expires_at"[[:space:]]*:[[:space:]]*"[^"]*"' "$f" 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)"
    if [[ -z "$exp" ]]; then
      has_fresh=1
      break
    fi
    # Portable-ish: try python3 for ISO parse; else treat as fresh if file mtime < 1h
    if command -v python3 >/dev/null 2>&1; then
      exp_epoch="$(python3 -c "import datetime; print(int(datetime.datetime.fromisoformat('${exp}'.replace('Z','+00:00')).timestamp()))" 2>/dev/null || echo 0)"
      if [[ "$exp_epoch" -gt "$now_epoch" ]]; then
        has_fresh=1
        break
      fi
    else
      # Fallback: file modified within last hour
      if [[ "$(find "$f" -mmin -60 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]]; then
        has_fresh=1
        break
      fi
    fi
  done
fi

if [[ "$has_fresh" -eq 1 ]]; then
  _allow
fi

# Soft remind: allow, but inject agent guidance (not a hard deny — Mode is not IDE sandbox)
cat <<'EOF'
{
  "permission": "allow",
  "agent_message": "Coreward Mode is ON and no fresh authorize ticket was found. Call MCP preflight (or npm run coreward:authorize -- --files …) once before proposing edits. This hook is fail-open — not an IDE sandbox."
}
EOF
exit 0
