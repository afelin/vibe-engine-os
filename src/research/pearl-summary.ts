import * as fs from "node:fs";
import * as path from "node:path";
import {
  readInterventions,
  type InterventionStage,
} from "./interventions.js";

export type InterventionStageCounts = {
  candidate: number;
  kept: number;
  dropped: number;
};

export type WeeklyPearlDelta = {
  firstPassGreenDelta: number;
  l0l1HealShareDelta: number;
  tokensMedianDelta: number;
  source?: string;
  interventionStages?: InterventionStageCounts;
  /** When true, stages were counted from the ledger (may all be zero). */
  interventionStagesFromLedger?: boolean;
};

const STAGE_KEYS: InterventionStage[] = ["candidate", "kept", "dropped"];

export function countInterventionStages(
  records: Array<{ stage?: string }>,
): InterventionStageCounts {
  const counts: InterventionStageCounts = {
    candidate: 0,
    kept: 0,
    dropped: 0,
  };
  for (const record of records) {
    const stage = record.stage;
    if (stage === "candidate" || stage === "kept" || stage === "dropped") {
      counts[stage] += 1;
    }
  }
  return counts;
}

function formatSigned(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "n/a";
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

function formatTokenDelta(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (Number.isInteger(value)) {
    return value > 0 ? `+${value}` : String(value);
  }
  return formatSigned(value, 2);
}

/**
 * Compact weekly Pearl story for operators / C-level.
 * Phase 4 will persist stages on interventions; until then, omit counts with a clear label.
 */
export function renderWeeklyPearlSummary(
  delta: WeeklyPearlDelta | null,
): string {
  const lines: string[] = [
    "## Weekly Pearl",
    "",
    "_This week vs last week (deterministic autoresearch deltas)._",
    "",
  ];

  if (!delta) {
    lines.push(
      "- **Delta:** unavailable — no prior weekly report to compare (null weeklyDelta).",
      "",
      "### Intervention stages",
      "",
      "- Stages not written yet (Phase 4 will persist candidate/kept/dropped).",
      "",
    );
    return lines.join("\n");
  }

  if (delta.source) {
    lines.push(`- **Compared to:** \`${delta.source}\``);
  }

  lines.push(
    `- **First-pass green delta:** ${formatSigned(delta.firstPassGreenDelta)}`,
    `- **L0/L1 heal share delta:** ${formatSigned(delta.l0l1HealShareDelta)}`,
    `- **Token median delta:** ${formatTokenDelta(delta.tokensMedianDelta)}`,
    "",
    "### Intervention stages",
    "",
  );

  const stages = delta.interventionStages;
  if (!stages) {
    lines.push(
      "- Stages not written yet (Phase 4 will persist candidate/kept/dropped on interventions).",
      "- Showing zeros until stages are recorded: candidate: 0 · kept: 0 · dropped: 0",
      "",
    );
  } else {
    lines.push(
      `- **candidate:** ${stages.candidate}`,
      `- **kept:** ${stages.kept}`,
      `- **dropped:** ${stages.dropped}`,
      "",
    );
    const total = STAGE_KEYS.reduce((sum, key) => sum + stages[key], 0);
    if (total === 0 && delta.interventionStagesFromLedger === false) {
      lines.push(
        "_Stages not written yet on interventions (counts are zeros)._",
        "",
      );
    } else if (total === 0) {
      lines.push(
        "_No staged interventions in the ledger yet (counts are zeros)._",
        "",
      );
    }
  }

  return lines.join("\n");
}

export function buildWeeklyPearlDeltaFromReport(
  report: {
    weeklyDelta?: {
      firstPassGreenDelta?: number;
      l0l1HealShareDelta?: number;
      tokensMedianDelta?: number;
      source?: string;
    } | null;
  } | null,
  rootDir: string,
): WeeklyPearlDelta | null {
  const weekly = report?.weeklyDelta;
  if (!weekly) return null;

  const interventions = readInterventions(rootDir, 500);
  const stages = countInterventionStages(interventions);
  const anyStaged = interventions.some(
    (row) =>
      row.stage === "candidate" ||
      row.stage === "kept" ||
      row.stage === "dropped",
  );

  const delta: WeeklyPearlDelta = {
    firstPassGreenDelta: Number(weekly.firstPassGreenDelta) || 0,
    l0l1HealShareDelta: Number(weekly.l0l1HealShareDelta) || 0,
    tokensMedianDelta: Number(weekly.tokensMedianDelta) || 0,
    source: typeof weekly.source === "string" ? weekly.source : undefined,
  };

  // Phase 4 will persist stages; until then omit counts so the render labels clearly.
  if (anyStaged) {
    delta.interventionStages = stages;
    delta.interventionStagesFromLedger = true;
  }

  return delta;
}

export function loadLatestResearchReport(
  rootDir: string,
): { file: string; report: unknown } | null {
  const researchDir = path.join(rootDir, ".runs", "research");
  if (!fs.existsSync(researchDir)) return null;

  const files = fs
    .readdirSync(researchDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;

  const file = files[files.length - 1]!;
  const full = path.join(researchDir, file);
  const report = JSON.parse(fs.readFileSync(full, "utf8")) as unknown;
  return { file, report };
}

/** CLI: print markdown summary for the latest autoresearch report. */
function main(): void {
  const rootDir = process.argv[2] ?? process.cwd();
  const latest = loadLatestResearchReport(rootDir);
  const report = (latest?.report ?? null) as {
    weeklyDelta?: WeeklyPearlDelta | null;
  } | null;
  const delta = buildWeeklyPearlDeltaFromReport(report, rootDir);
  process.stdout.write(renderWeeklyPearlSummary(delta));
}

const isDirectRun =
  process.argv[1]?.endsWith("pearl-summary.ts") ||
  process.argv[1]?.endsWith("pearl-summary.js");

if (isDirectRun) {
  main();
}
