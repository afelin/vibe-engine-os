import * as fs from "node:fs";
import * as path from "node:path";
import {
  parseRunManifest,
  parseScoreboardEntry,
} from "../constitution/parse.js";
import { computeVowsHash } from "../constitution/vows.js";
import { resolveRunDir, sanitizeRunId } from "./paths.js";

export type RunMetrics = {
  tokensEstimate?: number;
  attempts: number;
  firstPassGreen: boolean;
  gateIdsFailed: string[];
  durationMs: number;
  contextChars?: number;
  truncated?: boolean;
  hallucinationBlocked?: boolean;
  /** True when a zero-token release gate supplied the patch (no LLM). */
  gateHit?: boolean;
  healLevel?: number;
  agentSlot?: string;
  deterministicFix?: boolean;
  healOutcome?: "healed" | "guidance_delivered" | "approval_required" | "escalated";
};

export type RunManifest = {
  runId: string;
  issueNumber: string;
  issueTitle: string;
  branchName: string;
  baseSha: string;
  generatedFiles: string[];
  generatedFileDigests?: Record<string, string>;
  createdAt: string;
  approvalRequired?: boolean;
  vowsHash?: string;
  bondHash?: string;
  capsuleHash?: string;
  metrics?: RunMetrics;
};

export type ScoreboardEntry = {
  runId: string;
  issueNumber: string;
  issueTitle: string;
  success: boolean;
  state: string;
  createdAt: string;
  metrics: RunMetrics;
};

export function readRunManifest(rootDir: string, runId: string): RunManifest | null {
  const safeRunId = sanitizeRunId(runId);
  const manifestPath = path.join(resolveRunDir(rootDir, safeRunId), "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  return parseRunManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
}

export function writeRunManifest(rootDir: string, manifest: RunManifest) {
  const withVows: RunManifest = {
    ...manifest,
    vowsHash: manifest.vowsHash ?? computeVowsHash(rootDir),
  };
  const validated = parseRunManifest(withVows);
  const dir = resolveRunDir(rootDir, validated.runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(validated, null, 2)}\n`,
  );
}

export function writeActorSnapshot(
  rootDir: string,
  runId: string,
  snapshot: unknown,
) {
  const dir = resolveRunDir(rootDir, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "actor.snapshot.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
}

export function readActorSnapshot(rootDir: string, runId: string): unknown | null {
  const snapshotPath = path.join(resolveRunDir(rootDir, runId), "actor.snapshot.json");
  if (!fs.existsSync(snapshotPath)) return null;
  return JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as unknown;
}

export function appendScoreboardEntry(
  rootDir: string,
  entry: ScoreboardEntry,
): void {
  const validated = parseScoreboardEntry(entry);
  const scoreboardDir = path.join(rootDir, ".runs");
  fs.mkdirSync(scoreboardDir, { recursive: true });
  fs.appendFileSync(
    path.join(scoreboardDir, "scoreboard.ndjson"),
    `${JSON.stringify(validated)}\n`,
    "utf8",
  );
}

export function readScoreboardEntries(
  rootDir: string,
  limit = 20,
): ScoreboardEntry[] {
  const scoreboardPath = path.join(rootDir, ".runs", "scoreboard.ndjson");
  if (!fs.existsSync(scoreboardPath)) return [];

  const lines = fs
    .readFileSync(scoreboardPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .slice(-limit)
    .map((line) => parseScoreboardEntry(JSON.parse(line)))
    .reverse();
}

export type HealMixSummary = {
  total: number;
  withHealLevel: number;
  counts: { l0: number; l1: number; l2: number; l3: number };
  pct: { l0: number; l1: number; l2: number; l3: number };
  lastHealLevel?: number;
  lastHealRunId?: string;
  lastAgentSlot?: string;
  avgTokensEstimate: number;
};

/** % heals at L0/L1/L2/L3 from scoreboard rows that carry healLevel. */
export function summarizeHealMix(
  entries: ScoreboardEntry[],
): HealMixSummary {
  const counts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  let tokenSum = 0;
  let tokenN = 0;
  let lastHealLevel: number | undefined;
  let lastHealRunId: string | undefined;
  let lastAgentSlot: string | undefined;

  for (const entry of entries) {
    const level = entry.metrics.healLevel;
    if (level === undefined || level === null) continue;
    if (lastHealLevel === undefined) {
      lastHealLevel = level;
      lastHealRunId = entry.runId;
      lastAgentSlot = entry.metrics.agentSlot;
    }
    if (level === 0) counts.l0++;
    else if (level === 1) counts.l1++;
    else if (level === 2) counts.l2++;
    else if (level >= 3) counts.l3++;
    if (typeof entry.metrics.tokensEstimate === "number") {
      tokenSum += entry.metrics.tokensEstimate;
      tokenN++;
    }
  }

  const withHealLevel = counts.l0 + counts.l1 + counts.l2 + counts.l3;
  const pctOf = (n: number) =>
    withHealLevel === 0 ? 0 : Math.round((n / withHealLevel) * 100);

  return {
    total: entries.length,
    withHealLevel,
    counts,
    pct: {
      l0: pctOf(counts.l0),
      l1: pctOf(counts.l1),
      l2: pctOf(counts.l2),
      l3: pctOf(counts.l3),
    },
    lastHealLevel,
    lastHealRunId,
    lastAgentSlot,
    avgTokensEstimate: tokenN === 0 ? 0 : tokenSum / tokenN,
  };
}

export function renderRollbackInstructions(manifest: RunManifest) {
  return [
    `# Rollback ${manifest.runId}`,
    "",
    `Issue: #${manifest.issueNumber} ${manifest.issueTitle}`,
    `Branch: ${manifest.branchName}`,
    `Base SHA: ${manifest.baseSha}`,
    "",
    "Generated files:",
    ...renderGeneratedFiles(manifest.generatedFiles),
    "",
    "To inspect the change:",
    "",
    "```bash",
    `git diff ${manifest.baseSha}..HEAD`,
    "```",
    "",
    "To return to the base commit on this branch after review:",
    "",
    "```bash",
    `git revert --no-edit ${manifest.baseSha}..HEAD`,
    "```",
    "",
  ].join("\n");
}

function renderGeneratedFiles(files: string[]) {
  if (files.length === 0) return ["- No generated files recorded."];
  return files.map((file) => `- ${file}`);
}
