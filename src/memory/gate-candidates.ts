/**
 * Lesson → gate *candidate* stubs (human-approved merge into gates.json).
 * Never auto-merges into the live gate registry.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { EvoLesson } from "./lesson.js";
import { readLessons } from "./lesson.js";

export const GATE_CANDIDATES_REL = path.join(".vibe", "gate-candidates");

export type GateCandidateStub = {
  schema: "coreward.gate_candidate.v1";
  id: string;
  source_lesson_ids: string[];
  failureClass: string;
  reuseWhen: string[];
  suggested_paths: string[];
  symptom: string;
  fix: string;
  planLines: string[];
  /** Explicitly not merged — human/CI must promote into gates.json. */
  status: "candidate";
  createdAt: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function gateCandidatePath(rootDir: string, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "");
  return path.join(rootDir, GATE_CANDIDATES_REL, `${safe}.json`);
}

/**
 * Emit a gate candidate stub from a lesson with reuseWhen signals.
 * High-reuse: reuseWhen length ≥ 1 (caller may filter further).
 */
export function lessonToGateCandidate(
  lesson: EvoLesson,
  now = () => new Date().toISOString(),
): GateCandidateStub {
  const base =
    lesson.gate_id ??
    `from-lesson-${slugify(lesson.failureClass || lesson.id)}`;
  const id = `${base}-${crypto.createHash("sha256").update(lesson.id).digest("hex").slice(0, 8)}`;
  return {
    schema: "coreward.gate_candidate.v1",
    id,
    source_lesson_ids: [lesson.id],
    failureClass: lesson.failureClass,
    reuseWhen: lesson.reuseWhen,
    suggested_paths: [lesson.path].filter(Boolean),
    symptom: lesson.symptom,
    fix: lesson.fix,
    planLines: [
      `Candidate from lesson ${lesson.id} (${lesson.failureClass}).`,
      `Symptom: ${lesson.symptom}`,
      `Fix: ${lesson.fix}`,
      "Human must review and merge into src/release-gate/gates.json — not auto-applied.",
    ],
    status: "candidate",
    createdAt: now(),
  };
}

export function writeGateCandidate(
  rootDir: string,
  candidate: GateCandidateStub,
): string {
  const out = gateCandidatePath(rootDir, candidate.id);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  return out;
}

/**
 * Scan lessons and write candidate stubs for those with reuseWhen.
 * Returns written paths (skips overwrite if identical id already exists).
 */
export function emitGateCandidatesFromLessons(
  rootDir: string,
  opts?: { limit?: number; minReuseWhen?: number },
): { written: string[]; candidates: GateCandidateStub[] } {
  const minReuse = opts?.minReuseWhen ?? 1;
  const limit = opts?.limit ?? 20;
  const lessons = readLessons(rootDir, 200)
    .filter((l) => l.reuseWhen.length >= minReuse)
    .slice(-limit);

  const written: string[] = [];
  const candidates: GateCandidateStub[] = [];
  for (const lesson of lessons) {
    const candidate = lessonToGateCandidate(lesson);
    candidates.push(candidate);
    const out = writeGateCandidate(rootDir, candidate);
    written.push(out);
  }
  return { written, candidates };
}
