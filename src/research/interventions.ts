import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

export type InterventionRecord = {
  id: string;
  changedFiles: string[];
  diffHash: string;
  recordedAt: string;
};

const INTERVENTIONS_FILE = "interventions.ndjson";

const POLICY_PATHS = [
  "src/policy/mandates.json",
  "src/release-gate/gates.json",
  "evals/taskbond-gauntlet.jsonl",
];

function interventionsPath(rootDir: string): string {
  return path.join(rootDir, ".runs", INTERVENTIONS_FILE);
}

function gitDiffFiles(rootDir: string, paths: string[]): string[] {
  try {
    const output = execSync(`git diff --name-only HEAD -- ${paths.join(" ")}`, {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf8",
    }).trim();
    if (!output) return [];
    return output.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function gitDiffHash(rootDir: string, paths: string[]): string {
  try {
    const output = execSync(`git diff HEAD -- ${paths.join(" ")}`, {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    return crypto.createHash("sha256").update(output, "utf8").digest("hex");
  } catch {
    return "";
  }
}

export function detectPolicyChanges(rootDir: string): string[] {
  const existing = POLICY_PATHS.filter((file) =>
    fs.existsSync(path.join(rootDir, file)),
  );
  return gitDiffFiles(rootDir, existing);
}

export function appendIntervention(
  rootDir: string,
  changedFiles: string[],
): InterventionRecord | null {
  if (changedFiles.length === 0) return null;

  const diffHash =
    gitDiffHash(rootDir, changedFiles) ||
    crypto.createHash("sha256").update(changedFiles.join("\n"), "utf8").digest("hex");
  const record: InterventionRecord = {
    id: crypto.randomUUID(),
    changedFiles,
    diffHash,
    recordedAt: new Date().toISOString(),
  };

  const dir = path.join(rootDir, ".runs");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    interventionsPath(rootDir),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
  return record;
}

export function readInterventions(rootDir: string, limit = 20): InterventionRecord[] {
  const filePath = interventionsPath(rootDir);
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line) as InterventionRecord);
}

export function recordPolicyInterventions(rootDir: string): InterventionRecord | null {
  const changed = detectPolicyChanges(rootDir);
  return appendIntervention(rootDir, changed);
}

export { POLICY_PATHS };
