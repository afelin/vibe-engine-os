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

const summary = {
  runs: lines.length,
  successRate: lines.filter((entry) => entry.success).length / lines.length,
  firstPassRate:
    lines.filter((entry) => entry.metrics?.firstPassGreen).length / lines.length,
  averageDurationMs:
    lines.reduce((sum, entry) => sum + (entry.metrics?.durationMs ?? 0), 0) /
    lines.length,
};

console.log('## Scoreboard (last 20 runs)');
console.log(JSON.stringify(summary, null, 2));
console.log('');
for (const entry of lines.reverse()) {
  console.log(
    \`- \${entry.runId}: success=\${entry.success} attempts=\${entry.metrics?.attempts ?? 0} firstPass=\${entry.metrics?.firstPassGreen ?? false} durationMs=\${entry.metrics?.durationMs ?? 0}\`,
  );
}
"
