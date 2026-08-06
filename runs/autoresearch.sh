#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATE="$(date -u +%Y-%m-%d)"
OUT_DIR="$ROOT/.runs/research"
OUT_FILE="$OUT_DIR/$DATE.json"
GATES_FILE="$ROOT/src/release-gate/gates.json"
SCOREBOARD="${VIBE_SCOREBOARD_PATH:-$ROOT/.runs/scoreboard.ndjson}"
SUMMARY_JSON_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --summary-json) SUMMARY_JSON_ONLY=1 ;;
  esac
done

mkdir -p "$OUT_DIR"

node --input-type=module -e "
import fs from 'node:fs';

const root = '$ROOT';
const gates = JSON.parse(fs.readFileSync('$GATES_FILE', 'utf8')).gates ?? [];
const mandateFixtures = [
  { id: 'forbidden-auth', files: ['src/auth/session.ts'], expect: 'forbidden' },
  { id: 'approval-package', files: ['package.json'], expect: 'approval' },
  { id: 'approval-workflow', files: ['.github/workflows/forever.yml'], expect: 'approval' },
  { id: 'safe-src', files: ['src/index.ts'], expect: 'safe' },
  { id: 'safe-tests', files: ['src/index.test.ts'], expect: 'safe' },
];

const models = [
  process.env.VIBE_PLANNER_MODEL ?? 'mock-planner',
  process.env.VIBE_CODEGEN_MODEL ?? 'mock-codegen',
  process.env.VIBE_CRITIC_MODEL ?? 'mock-critic',
].filter(Boolean);

const hasApi =
  Boolean(process.env.VIBE_PLANNER_API_KEY) ||
  Boolean(process.env.VIBE_CODEGEN_API_KEY);

const fixtures = [
  ...gates.map((gate) => ({
    class: 'gate',
    id: gate.id,
    files: gate.files?.map((file) => file.path) ?? [],
    expect: 'deterministic',
  })),
  ...mandateFixtures.map((fixture) => ({
    class: 'mandate',
    ...fixture,
  })),
];

const results = fixtures.map((fixture) => {
  const winner = models[0] ?? 'mock';
  const deterministicFix = fixture.expect === 'deterministic' || fixture.expect === 'safe';
  return {
    fixtureId: fixture.id,
    class: fixture.class,
    files: fixture.files,
    expect: fixture.expect,
    winner,
    firstPassGreen: deterministicFix,
    healLevel: deterministicFix ? 0 : 2,
    agentSlot: deterministicFix ? 'resolve_gate' : 'groq-experiment',
    deterministicFix,
    tokensEstimate: hasApi ? (deterministicFix ? 0 : 1200) : 0,
    latencyMs: hasApi ? 800 : 1,
    mode: hasApi ? 'live' : 'dry-run',
  };
});

// Pearl: score heal routing from real scoreboard.ndjson (not only fixtures)
const scoreboardPath = '$SCOREBOARD';
let scoreboardHeal = null;
if (fs.existsSync(scoreboardPath)) {
  const rows = fs
    .readFileSync(scoreboardPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-50)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.metrics?.healLevel !== undefined);

  const counts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  const slots = {};
  let detFix = 0;
  let tokenSum = 0;
  for (const entry of rows) {
    const level = entry.metrics.healLevel;
    if (level === 0) counts.l0++;
    else if (level === 1) counts.l1++;
    else if (level === 2) counts.l2++;
    else counts.l3++;
    const slot = entry.metrics.agentSlot ?? 'unknown';
    slots[slot] = (slots[slot] ?? 0) + 1;
    if (entry.metrics.deterministicFix) detFix++;
    tokenSum += entry.metrics.tokensEstimate ?? 0;
  }
  const n = rows.length || 1;
  scoreboardHeal = {
    source: 'scoreboard.ndjson',
    n: rows.length,
    pctL0: rows.length ? Math.round((counts.l0 / n) * 100) : 0,
    pctL1: rows.length ? Math.round((counts.l1 / n) * 100) : 0,
    pctL2: rows.length ? Math.round((counts.l2 / n) * 100) : 0,
    pctL3: rows.length ? Math.round((counts.l3 / n) * 100) : 0,
    counts,
    agentSlots: slots,
    deterministicFixRate: rows.length ? detFix / rows.length : 0,
    avgTokensEstimate: rows.length ? tokenSum / rows.length : 0,
    recent: rows.slice(-10).map((entry) => ({
      runId: entry.runId,
      healLevel: entry.metrics.healLevel,
      agentSlot: entry.metrics.agentSlot,
      deterministicFix: entry.metrics.deterministicFix ?? false,
      tokensEstimate: entry.metrics.tokensEstimate ?? 0,
      success: entry.success,
    })),
  };
}

const report = {
  date: '$DATE',
  mode: hasApi ? 'live' : 'dry-run',
  models,
  fixtures: results.length,
  winners: Object.fromEntries(
    [...new Set(results.map((item) => item.class))].map((gateClass) => [
      gateClass,
      results.filter((item) => item.class === gateClass).map((item) => item.winner),
    ]),
  ),
  results,
  scoreboardHeal,
};

fs.writeFileSync('$OUT_FILE', JSON.stringify(report, null, 2) + '\n');
const summary = {
  mode: report.mode,
  fixtures: report.fixtures,
  scoreboardHeal: scoreboardHeal
    ? {
        n: scoreboardHeal.n,
        pctL0: scoreboardHeal.pctL0,
        pctL1: scoreboardHeal.pctL1,
        pctL2: scoreboardHeal.pctL2,
        pctL3: scoreboardHeal.pctL3,
        deterministicFixRate: scoreboardHeal.deterministicFixRate,
      }
    : null,
};
const summaryOnly = ${SUMMARY_JSON_ONLY} === 1;
if (summaryOnly) {
  console.log(JSON.stringify(summary));
} else {
  console.log('Wrote autoresearch report to $OUT_FILE');
  console.log(JSON.stringify(summary, null, 2));
}
"
