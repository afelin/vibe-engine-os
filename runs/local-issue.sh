#!/usr/bin/env bash
set -euo pipefail

export ISSUE_NUMBER="${ISSUE_NUMBER:-000}"
export ISSUE_TITLE="${ISSUE_TITLE:-Local Smoke Issue}"
export ISSUE_BODY="${ISSUE_BODY:-Run local Vibe Engine smoke path.}"

bun run agent.ts
