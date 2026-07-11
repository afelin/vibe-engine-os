import * as fs from "node:fs";
import * as path from "node:path";

export type RunMetrics = {
  tokensEstimate?: number;
  attempts: number;
  firstPassGreen: boolean;
  gateIdsFailed: string[];
  durationMs: number;
};

export type RunManifest = {
  runId: string;
  issueNumber: string;
  issueTitle: string;
  branchName: string;
  baseSha: string;
  generatedFiles: string[];
  createdAt: string;
  approvalRequired?: boolean;
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

export function writeRunManifest(rootDir: string, manifest: RunManifest) {
  const dir = path.join(rootDir, ".runs", manifest.runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export function appendScoreboardEntry(
  rootDir: string,
  entry: ScoreboardEntry,
): void {
  const scoreboardDir = path.join(rootDir, ".runs");
  fs.mkdirSync(scoreboardDir, { recursive: true });
  fs.appendFileSync(
    path.join(scoreboardDir, "scoreboard.ndjson"),
    `${JSON.stringify(entry)}\n`,
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
    .map((line) => JSON.parse(line) as ScoreboardEntry)
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
