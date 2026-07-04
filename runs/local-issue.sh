#!/usr/bin/env bash
set -euo pipefail

export ISSUE_NUMBER="${ISSUE_NUMBER:-000}"
export ISSUE_TITLE="${ISSUE_TITLE:-Local Smoke Issue}"
export ISSUE_BODY="${ISSUE_BODY:-Run local Vibe Engine smoke path.}"

if command -v bun >/dev/null 2>&1; then
  bun run agent.ts
else
  npx tsx agent.ts
fi
