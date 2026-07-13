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
