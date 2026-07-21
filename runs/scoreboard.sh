#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCOREBOARD="$ROOT/.runs/scoreboard.ndjson"

if [[ ! -f "$SCOREBOARD" ]]; then
  echo "No scoreboard entries yet."
  exit 0
fi

node --input-type=module -e "
import fs from 'node:fs';

const lines = fs.readFileSync('$SCOREBOARD', 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(-20)
  .map((line) => JSON.parse(line));

const healRows = lines.filter((entry) => entry.metrics?.healLevel !== undefined);
const healCounts = { l0: 0, l1: 0, l2: 0, l3: 0 };
for (const entry of healRows) {
  const level = entry.metrics.healLevel;
  if (level === 0) healCounts.l0++;
  else if (level === 1) healCounts.l1++;
  else if (level === 2) healCounts.l2++;
  else healCounts.l3++;
}
const healN = healRows.length || 1;
const pct = (n) => Math.round((n / healN) * 100);
const avgTokens =
  healRows.length === 0
    ? 0
    : healRows.reduce((sum, entry) => sum + (entry.metrics?.tokensEstimate ?? 0), 0) /
      healRows.length;

const summary = {
  runs: lines.length,
  successRate: lines.filter((entry) => entry.success).length / lines.length,
  firstPassRate:
    lines.filter((entry) => entry.metrics?.firstPassGreen).length / lines.length,
  averageDurationMs:
    lines.reduce((sum, entry) => sum + (entry.metrics?.durationMs ?? 0), 0) /
    lines.length,
  averageContextChars:
    lines.reduce((sum, entry) => sum + (entry.metrics?.contextChars ?? 0), 0) /
    lines.length,
  truncationRate:
    lines.filter((entry) => entry.metrics?.truncated).length / lines.length,
  hallucinationBlockRate:
    lines.filter((entry) => entry.metrics?.hallucinationBlocked).length /
    lines.length,
  healMix: {
    n: healRows.length,
    pctL0: healRows.length ? pct(healCounts.l0) : 0,
    pctL1: healRows.length ? pct(healCounts.l1) : 0,
    pctL2: healRows.length ? pct(healCounts.l2) : 0,
    pctL3: healRows.length ? pct(healCounts.l3) : 0,
    counts: healCounts,
    avgTokensEstimate: avgTokens,
    lastHealLevel: healRows[healRows.length - 1]?.metrics?.healLevel,
  },
};

console.log('## Scoreboard (last 20 runs)');
const firstPassPct = (summary.firstPassRate * 100).toFixed(0);
const hallucinationPct = (summary.hallucinationBlockRate * 100).toFixed(0);
console.log(
  \`Plain English: \${summary.runs} recent runs — \${(summary.successRate * 100).toFixed(0)}% succeeded, \${firstPassPct}% first-pass green, \${summary.hallucinationBlockRate > 0 ? hallucinationPct + '% blocked off-scope paths' : 'no hallucination blocks'}.\`,
);
if (summary.healMix.n > 0) {
  console.log(
    \`Heal mix: L0 \${summary.healMix.pctL0}% · L1 \${summary.healMix.pctL1}% · L2 \${summary.healMix.pctL2}% · L3 \${summary.healMix.pctL3}% (n=\${summary.healMix.n}, avg tokens \${summary.healMix.avgTokensEstimate.toFixed(0)}, last L\${summary.healMix.lastHealLevel}).\`,
  );
}
console.log(JSON.stringify(summary, null, 2));
console.log('');
for (const entry of lines.reverse()) {
  const heal =
    entry.metrics?.healLevel !== undefined
      ? \` healLevel=\${entry.metrics.healLevel} slot=\${entry.metrics?.agentSlot ?? '-'} det=\${entry.metrics?.deterministicFix ?? false}\`
      : '';
  console.log(
    \`- \${entry.runId}: success=\${entry.success} attempts=\${entry.metrics?.attempts ?? 0} firstPass=\${entry.metrics?.firstPassGreen ?? false} durationMs=\${entry.metrics?.durationMs ?? 0} contextChars=\${entry.metrics?.contextChars ?? 0} truncated=\${entry.metrics?.truncated ?? false} hallucinationBlocked=\${entry.metrics?.hallucinationBlocked ?? false}\${heal}\`,
  );
}
"
