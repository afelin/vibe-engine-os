#!/usr/bin/env bash
# Prelaunch test battery — Karpathy dial: fast | full | cloud
# Writes .vibe/battery-prelaunch.json (claims + killers + funnel + elapsedMs).
# Does NOT double-run check + full activate (activate already runs check).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${VIBE_BATTERY_MODE:-fast}"
for arg in "$@"; do
  case "$arg" in
    --fast) MODE=fast ;;
    --full) MODE=full ;;
    --cloud) MODE=cloud ;;
    -h|--help)
      echo "usage: battery-prelaunch.sh [--fast|--full|--cloud]"
      echo "  or VIBE_BATTERY_MODE=fast|full|cloud"
      echo "  cloud launch-proof requires VIBE_BATTERY_CLOUD=1"
      exit 0
      ;;
  esac
done

case "$MODE" in
  fast|full|cloud) ;;
  *)
    echo "❌ Unknown mode: $MODE (want fast|full|cloud)"
    exit 2
    ;;
esac

START_MS="$(node -e 'process.stdout.write(String(Date.now()))')"
TMP_DIR="$(mktemp -d)"
ASSERTS_FILE="$TMP_DIR/asserts.json"
FUNNEL_FILE="$TMP_DIR/funnel.json"
FAILED=0

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# assertResults object (mutated via node)
echo '{}' >"$ASSERTS_FILE"
echo '{"goGuideActions":3}' >"$FUNNEL_FILE"

set_assert() {
  local key="$1"
  local val="$2"
  node -e '
const fs = require("fs");
const p = process.argv[1];
const k = process.argv[2];
const v = process.argv[3] === "true";
const o = JSON.parse(fs.readFileSync(p, "utf8"));
o[k] = v;
fs.writeFileSync(p, JSON.stringify(o));
' "$ASSERTS_FILE" "$key" "$val"
}

set_funnel() {
  local key="$1"
  local val="$2"
  node -e '
const fs = require("fs");
const p = process.argv[1];
const k = process.argv[2];
const v = process.argv[3];
const o = JSON.parse(fs.readFileSync(p, "utf8"));
const n = Number(v);
o[k] = Number.isFinite(n) && String(n) === v ? n : v;
fs.writeFileSync(p, JSON.stringify(o));
' "$FUNNEL_FILE" "$key" "$val"
}

run_step() {
  local label="$1"
  shift
  echo ""
  echo "▶ $label"
  if "$@"; then
    echo "✓ $label"
    return 0
  else
    echo "✗ $label"
    FAILED=1
    return 1
  fi
}

soft_step() {
  local label="$1"
  shift
  echo ""
  echo "▶ $label (soft)"
  if "$@"; then
    echo "✓ $label (soft)"
    return 0
  else
    echo "⚠ $label soft-failed (continuing)"
    return 1
  fi
}

echo "🔋 Prelaunch battery mode=$MODE"

# ── fast core (also included in full/cloud) ──────────────────────────────────
# check once — never npm run activate here (would re-run check)
if run_step "check" npm run check; then
  set_assert check true
else
  set_assert check false
fi

if run_step "eval:bond" npm run eval:bond; then
  set_assert eval_bond true
else
  set_assert eval_bond false
fi

# Moments include stackables MCP round-trip (vitest). Avoid npx tsx -e here —
# importing mcp-handlers under tsx -e hits @xmachines/play-catalog exports on CI.
if run_step "battery-moments" npx vitest run src/launch/battery-moments.test.ts; then
  set_assert battery_moments true
  set_assert mcp_stackables_smoke true
else
  set_assert battery_moments false
  set_assert mcp_stackables_smoke false
fi

# Sacred Ward eval — claim ledger ward_* asserts only after green
if run_step "ward sacred" npx vitest run src/ward/sacred-eval.test.ts; then
  set_assert ward_sacred true
else
  set_assert ward_sacred false
fi

# authorize_write + Coreward Mode sacred
if run_step "authorize_write sacred" npx vitest run src/coreward/authorize-write.test.ts; then
  set_assert authorize_write_sacred true
else
  set_assert authorize_write_sacred false
fi

# Local savings attestation (hash-chained metrics) — claim savings_attestation_local
if run_step "savings:attest" npx vitest run src/savings/attest.test.ts; then
  set_assert savings_attest true
else
  set_assert savings_attest false
fi

# Soft CyberReady — not_installed is success for free path; soft-fail does not hard-fail battery
if soft_step "CyberReady soft" npx tsx -e '
import { cyberreadyValidateDelta } from "./src/release-gate/cyberready-bridge.ts";
delete process.env.CYBERREADY_SOCK;
const r = cyberreadyValidateDelta({});
if (r.reason !== "not_installed") {
  console.error("expected not_installed, got", r);
  process.exit(1);
}
process.stdout.write("cyberready soft ok (not_installed)\n");
'; then
  set_assert cyberready_soft true
else
  echo "⚠ CyberReady soft left unclaimed (paid stub)"
fi

# ── full extras ──────────────────────────────────────────────────────────────
if [ "$MODE" = "full" ] || [ "$MODE" = "cloud" ]; then
  if run_step "launch:readiness" npm run launch:readiness; then
    set_assert launch_readiness true
  else
    set_assert launch_readiness false
  fi

  if run_step "orchestrate:smoke" npm run orchestrate:smoke; then
    set_assert orchestrate_smoke_or_activate_no_llm true
  else
    set_assert orchestrate_smoke_or_activate_no_llm false
  fi

  if run_step "metrics:check" npm run metrics:check; then
    set_assert metrics_check true
  else
    set_assert metrics_check false
  fi

  if run_step "launch:ship --dry-run" npm run launch:ship -- --dry-run; then
    set_assert launch_ship_dry true
  else
    set_assert launch_ship_dry false
  fi

  REDTEAM="evals/taskbond-gauntlet-redteam.jsonl"
  if [ -f "$REDTEAM" ]; then
    if run_step "redteam gauntlet" npx tsx -e '
import * as fs from "node:fs";
import * as path from "node:path";
import {
  parseGauntletJsonl,
  runTaskBondGauntlet,
} from "./src/bond/gauntletRunner.ts";

const root = ".";
const casesPath = path.join(root, "evals/taskbond-gauntlet-redteam.jsonl");
const cases = parseGauntletJsonl(fs.readFileSync(casesPath, "utf8"));
const scorecard = runTaskBondGauntlet(cases, root);
console.log(`redteam: ${scorecard.pass}/${scorecard.total}`);
if (scorecard.fail > 0) process.exit(1);
'; then
      set_assert redteam true
    else
      set_assert redteam false
    fi
  else
    echo "⏭ redteam skipped (no $REDTEAM)"
  fi
fi

# ── cloud launch proof ───────────────────────────────────────────────────────
if [ "$MODE" = "cloud" ]; then
  if [ "${VIBE_BATTERY_CLOUD:-}" = "1" ]; then
    if run_step "launch proof (cloud)" npm run launch:ship; then
      set_assert launch_proof true
      if [ -f .vibe/launch-proof.json ]; then
        set_funnel launchProofPresent true
      fi
    else
      set_assert launch_proof false
    fi
  else
    echo "⏭ cloud launch-proof skipped (set VIBE_BATTERY_CLOUD=1 to enable)"
  fi
fi

END_MS="$(node -e 'process.stdout.write(String(Date.now()))')"
ELAPSED=$((END_MS - START_MS))

echo ""
echo "📝 Writing claim ledger (.vibe/battery-prelaunch.json)"
FUNNEL_JSON="$(cat "$FUNNEL_FILE")"
npx tsx src/launch/claim-ledger.ts \
  --write \
  --mode "$MODE" \
  --elapsed "$ELAPSED" \
  --root "$ROOT" \
  --asserts-file "$ASSERTS_FILE" \
  --funnel "$FUNNEL_JSON"

echo ""
echo "🔋 Battery mode=$MODE elapsedMs=$ELAPSED"
if [ "$FAILED" -ne 0 ]; then
  echo "❌ Prelaunch battery failed"
  exit 1
fi
echo "✅ Prelaunch battery green"
exit 0
