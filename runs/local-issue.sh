#!/usr/bin/env bash
set -euo pipefail

export ISSUE_NUMBER="${ISSUE_NUMBER:-000}"
export ISSUE_TITLE="${ISSUE_TITLE:-Local Smoke Issue}"
export ISSUE_BODY="${ISSUE_BODY:-Run local Vibe Engine smoke path.}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
