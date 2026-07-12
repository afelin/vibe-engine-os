#!/usr/bin/env bash
set -euo pipefail

export ISSUE_NUMBER="${ISSUE_NUMBER:-000}"
export ISSUE_TITLE="${ISSUE_TITLE:-Local Smoke Issue}"
export ISSUE_BODY="${ISSUE_BODY:-Run local Vibe Engine smoke path.}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Default subgraph vitest for depth ≥ 3 daily runs (override with VIBE_TEST_MODE=full)
if [ -z "${VIBE_TEST_MODE:-}" ]; then
  LABELS_LOWER=$(echo "${VIBE_LABELS:-}" | tr '[:upper:]' '[:lower:]')
  DEPTH="${VIBE_DEPTH:-3}"
  if echo "$LABELS_LOWER" | grep -q "vibe:plan-only"; then DEPTH=1; fi
  if echo "$LABELS_LOWER" | grep -q "vibe:safe"; then DEPTH=2; fi
  if echo "$LABELS_LOWER" | grep -q "vibe:ship"; then DEPTH=4; fi
  if [ "$DEPTH" -ge 3 ] 2>/dev/null; then
    export VIBE_TEST_MODE=subgraph
  else
    export VIBE_TEST_MODE=full
  fi
  echo "⚡ VIBE_TEST_MODE=$VIBE_TEST_MODE (depth=$DEPTH)"
fi

if npx tsx <<'TS'
import { resolveReleaseGatePatch } from "./src/release-gate/resolve.js";

const title = process.env.ISSUE_TITLE ?? "";
const body = process.env.ISSUE_BODY ?? "";
process.exit(resolveReleaseGatePatch(title, body) ? 0 : 1);
TS
then
  export VIBE_PLANNER_PROVIDER=off
  export VIBE_CODEGEN_PROVIDER=off
  export VIBE_CRITIC_PROVIDER=off
  echo "⚡ Release gate matched — zero-token run (LLM providers off)"
fi

if command -v bun >/dev/null 2>&1; then
  bun run agent.ts
else
  npx tsx agent.ts
fi
