import type { VibeDepth } from "../os/depth.js";
import {
  evaluateMandates,
  type MandateEvaluation,
  type Mandates,
} from "../policy/evaluate.js";
import { loadEffectiveMandates } from "../policy/stackables.js";
import { loadProjectProfile, mergeAllowedPrefixes } from "./profile.js";

export type TaskBondViolation = {
  rule:
    | "missing_bound_files"
    | "too_many_bound_files"
    | "intent_too_long"
    | "forbidden_prefix"
    | "require_approval"
    | "disallowed_prefix"
    | "missing_intent"
    | "outcome_command_injection";
  path?: string;
  detail: string;
};

/** Operator slash-commands must not be smuggled via outcome text. */
const OUTCOME_COMMAND_RE =
  /(?:^|\s)\/(approve|retry|rollback|continue|go|status|deploy|details|troubleshoot)\b/i;

export type TaskBondEval = {
  passed: boolean;
  violations: TaskBondViolation[];
  mandateEval: MandateEvaluation;
  requiresApproval: boolean;
};

export type TaskBondDraft = {
  intent: string;
  outcomes: string[];
  boundFiles: string[];
  constraints: string[];
};

function bondPolicy(mandates: Mandates) {
  return (
    mandates.bond ?? {
      require_bound_files_min_depth: 2,
      max_bound_files: 16,
      max_intent_chars: 500,
      allowed_file_prefixes: ["src/", "tests/", ".planning/", ".skills/"],
    }
  );
}

export function evaluateTaskBond(
  draft: TaskBondDraft,
  depth: VibeDepth,
  rootDir = ".",
  mandates: Mandates = loadEffectiveMandates(rootDir),
): TaskBondEval {
  const policy = bondPolicy(mandates);
  const profile = loadProjectProfile(undefined, rootDir);
  const allowedPrefixes = mergeAllowedPrefixes(
    policy.allowed_file_prefixes,
    profile,
  );

  const violations: TaskBondViolation[] = [];

  if (!draft.intent.trim()) {
    violations.push({
      rule: "missing_intent",
      detail: "Intent is required. Fill the Intent field in the Vibe Request issue.",
    });
  }

  if (draft.intent.length > policy.max_intent_chars) {
    violations.push({
      rule: "intent_too_long",
      detail: `Intent exceeds ${policy.max_intent_chars} characters.`,
    });
  }

  for (const outcome of draft.outcomes) {
    if (OUTCOME_COMMAND_RE.test(outcome)) {
      violations.push({
        rule: "outcome_command_injection",
        detail:
          "Outcomes must not contain operator slash-commands (e.g. /approve). Approval requires a real operator comment.",
      });
      break;
    }
  }

  if (
    depth >= policy.require_bound_files_min_depth &&
    draft.boundFiles.length === 0
  ) {
    violations.push({
      rule: "missing_bound_files",
      detail:
        "boundFiles required at this depth. Add exact paths under Files to touch in the issue.",
    });
  }

  if (draft.boundFiles.length > policy.max_bound_files) {
    violations.push({
      rule: "too_many_bound_files",
      detail: `At most ${policy.max_bound_files} bound files allowed.`,
    });
  }

  for (const filePath of draft.boundFiles) {
    if (
      filePath.includes("..") ||
      filePath.startsWith("/") ||
      filePath.startsWith("~")
    ) {
      violations.push({
        rule: "disallowed_prefix",
        path: filePath,
        detail: "Path traversal or absolute paths are not allowed.",
      });
      continue;
    }

    const bindable =
      allowedPrefixes.some((prefix) => filePath.startsWith(prefix)) ||
      mandates.require_approval_prefixes.some(
        (prefix) => filePath === prefix || filePath.startsWith(prefix),
      );

    if (!bindable) {
      violations.push({
        rule: "disallowed_prefix",
        path: filePath,
        detail: `Path must start with one of: ${allowedPrefixes.join(", ")}`,
      });
    }
  }

  const mandateEval = evaluateMandates(draft.boundFiles, mandates);

  for (const violation of mandateEval.violations) {
    violations.push({
      rule:
        violation.rule === "forbidden" ? "forbidden_prefix" : "require_approval",
      path: violation.path,
      detail: `${violation.rule} prefix ${violation.prefix}`,
    });
  }

  const blocking = violations.filter(
    (item) => item.rule !== "require_approval",
  );
  const mandateBlocking = !mandateEval.passed;

  return {
    passed: blocking.length === 0 && !mandateBlocking,
    violations,
    mandateEval,
    requiresApproval: mandateEval.requiresApproval,
  };
}
