import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { readActiveStack } from "../policy/stackables.js";
import {
  applyWeeklyInterventionClosure,
  assignInterventionFollowUp,
  emitFollowUps,
  evaluateInterventionStage,
  readAllInterventions,
  updateInterventionStage,
} from "./intervention-closure.mjs";

export type InterventionStage = "candidate" | "kept" | "dropped";

export type InterventionFollowUp = {
  owner: "operator" | "engineer" | "policy";
  action: string;
  dueBy: string;
};

export type InterventionRecord = {
  id: string;
  changedFiles: string[];
  diffHash: string;
  recordedAt: string;
  stage?: InterventionStage;
  stageReason?: string;
  followUp?: InterventionFollowUp;
  /** Active legal space at record time (audit tag). */
  legalSpace?: string;
};

export type InterventionDelta = {
  firstPassGreenDelta: number;
  l0l1HealShareDelta: number;
  tokensMedianDelta: number;
};

export type InterventionFollowUpRecord = {
  interventionId: string;
  owner: InterventionFollowUp["owner"];
  action: string;
  dueBy: string;
  stage?: InterventionStage;
  emittedAt: string;
  legalSpace?: string;
};

export type WeeklyClosureResult = {
  stage: InterventionStage;
  reason: string;
  updated: number;
  followUps: InterventionFollowUpRecord[];
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

function readActiveLegalSpace(rootDir: string): string | undefined {
  try {
    const space = readActiveStack(rootDir)?.legalSpace?.trim();
    return space || undefined;
  } catch {
    return undefined;
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
  const legalSpace = readActiveLegalSpace(rootDir);
  const record: InterventionRecord = {
    id: crypto.randomUUID(),
    changedFiles,
    diffHash,
    recordedAt: new Date().toISOString(),
    ...(legalSpace ? { legalSpace } : {}),
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
  return (readAllInterventions(rootDir) as InterventionRecord[]).slice(-limit);
}

export function recordPolicyInterventions(rootDir: string): InterventionRecord | null {
  const changed = detectPolicyChanges(rootDir);
  return appendIntervention(rootDir, changed);
}

export {
  applyWeeklyInterventionClosure,
  assignInterventionFollowUp,
  emitFollowUps,
  evaluateInterventionStage,
  updateInterventionStage,
};

/** CLI: apply weekly closure from latest research report when invoked directly. */
function main(): void {
  const rootDir = process.argv[2] ?? process.cwd();
  const researchDir = path.join(rootDir, ".runs", "research");
  let delta: InterventionDelta | null = null;

  if (fs.existsSync(researchDir)) {
    const files = fs
      .readdirSync(researchDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
    if (files.length > 0) {
      const latest = path.join(researchDir, files[files.length - 1]!);
      try {
        const report = JSON.parse(fs.readFileSync(latest, "utf8")) as {
          weeklyDelta?: InterventionDelta | null;
        };
        if (report.weeklyDelta) {
          delta = {
            firstPassGreenDelta: Number(report.weeklyDelta.firstPassGreenDelta) || 0,
            l0l1HealShareDelta: Number(report.weeklyDelta.l0l1HealShareDelta) || 0,
            tokensMedianDelta: Number(report.weeklyDelta.tokensMedianDelta) || 0,
          };
        }
      } catch {
        delta = null;
      }
    }
  }

  const result = applyWeeklyInterventionClosure(rootDir, delta);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isDirectRun =
  process.argv[1]?.endsWith("interventions.ts") ||
  process.argv[1]?.endsWith("interventions.js");

if (isDirectRun) {
  main();
}

export { POLICY_PATHS };
