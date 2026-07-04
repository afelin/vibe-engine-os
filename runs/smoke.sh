#!/usr/bin/env bash
set -euo pipefail

npm test
npx tsc --noEmit
bash runs/operator-smoke.sh
