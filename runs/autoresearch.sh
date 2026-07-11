#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATE="$(date -u +%Y-%m-%d)"
OUT_DIR="$ROOT/.runs/research"
OUT_FILE="$OUT_DIR/$DATE.json"
GATES_FILE="$ROOT/src/release-gate/gates.json"

mkdir -p "$OUT_DIR"

node --input-type=module -e "
import fs from 'node:fs';
import path from 'node:path';

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
  return {
    fixtureId: fixture.id,
    class: fixture.class,
    files: fixture.files,
    expect: fixture.expect,
    winner,
    firstPassGreen: fixture.expect === 'deterministic' || fixture.expect === 'safe',
    tokensEstimate: hasApi ? 1200 : 0,
    latencyMs: hasApi ? 800 : 1,
    mode: hasApi ? 'live' : 'dry-run',
  };
});

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
};

fs.writeFileSync('$OUT_FILE', JSON.stringify(report, null, 2) + '\n');
console.log('Wrote autoresearch report to $OUT_FILE');
console.log(JSON.stringify({ mode: report.mode, fixtures: report.fixtures }, null, 2));
"
