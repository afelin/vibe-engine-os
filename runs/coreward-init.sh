#!/usr/bin/env bash
# Thin wrapper — prefer: npm run coreward:init
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec npx tsx src/coreward/init.ts "$@"
