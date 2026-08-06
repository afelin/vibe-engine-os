import * as crypto from "node:crypto";
import type { VibeDepth } from "../os/depth.js";
import type { Mandates } from "../policy/evaluate.js";
import { parseTaskBond } from "../constitution/parse.js";
import { evaluateTaskBond, type TaskBondDraft } from "./evaluate.js";
import { parseIssueBody } from "./parse.js";

export type TaskBond = {
  issueNumber: string;
  issueTitle: string;
  intent: string;
  outcomes: string[];
  boundFiles: string[];
  constraints: string[];
  depth: VibeDepth;
  bondHash: string;
  sealedAt: string;
};

export type SealTaskBondInput = {
  issueNumber: string;
  issueTitle: string;
  issueBody: string;
  depth: VibeDepth;
  rootDir?: string;
  extraBoundFiles?: string[];
  /** Optional mandate overlay (e.g. gauntlet legal_space); skips disk active-stack. */
  mandates?: Mandates;
};

export type SealTaskBondResult =
  | { ok: true; bond: TaskBond; evaluation: ReturnType<typeof evaluateTaskBond> }
  | { ok: false; errors: string[]; evaluation: ReturnType<typeof evaluateTaskBond> };

function computeBondHash(payload: Omit<TaskBond, "bondHash" | "sealedAt">): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}

export function sealTaskBond(input: SealTaskBondInput): SealTaskBondResult {
  const rootDir = input.rootDir ?? ".";
  const parsed = parseIssueBody(input.issueBody);
  const draft: TaskBondDraft = {
    intent: parsed.intent,
    outcomes: parsed.outcomes,
    boundFiles: [
      ...new Set([...parsed.boundFiles, ...(input.extraBoundFiles ?? [])]),
    ],
    constraints: parsed.constraints,
  };

  const evaluation = input.mandates
    ? evaluateTaskBond(draft, input.depth, rootDir, input.mandates)
    : evaluateTaskBond(draft, input.depth, rootDir);

  if (!evaluation.passed) {
    return {
      ok: false,
      errors: evaluation.violations.map(
        (item) => `${item.rule}: ${item.detail}${item.path ? ` (${item.path})` : ""}`,
      ),
      evaluation,
    };
  }

  const sealedAt = new Date().toISOString();
  const withoutHash = {
    issueNumber: input.issueNumber,
    issueTitle: input.issueTitle,
    intent: draft.intent,
    outcomes: draft.outcomes,
    boundFiles: draft.boundFiles,
    constraints: draft.constraints,
    depth: input.depth,
  };

  const bondHash = computeBondHash(withoutHash);
  const bond = parseTaskBond({
    ...withoutHash,
    bondHash,
    sealedAt,
  }) as TaskBond;

  return { ok: true, bond, evaluation };
}
