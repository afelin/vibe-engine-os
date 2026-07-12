import type { MandateEvaluation } from "../policy/evaluate.js";
import type { TaskBondEval, TaskBondViolation } from "./evaluate.js";
import type { SealTaskBondResult } from "./seal.js";

export type Verdict =
  | {
      ok: true;
      bondHash?: string;
      requiresApproval?: boolean;
      approvalPaths?: string[];
      detail?: string;
    }
  | { ok: false; reason: string; path?: string; detail?: string };

function primaryBlockingRule(
  evaluation: TaskBondEval,
): TaskBondViolation | undefined {
  const blocking = evaluation.violations.filter(
    (item) => item.rule !== "require_approval",
  );
  if (blocking.length > 0) return blocking[0];
  if (!evaluation.mandateEval.passed) {
    const forbidden = evaluation.mandateEval.violations.find(
      (item) => item.rule === "forbidden",
    );
    if (forbidden) {
      return {
        rule: "forbidden_prefix",
        path: forbidden.path,
        detail: `forbidden prefix ${forbidden.prefix}`,
      };
    }
  }
  return undefined;
}

export function formatTaskBondEvalVerdict(
  evaluation: TaskBondEval,
  bondHash?: string,
): Verdict {
  if (evaluation.passed) {
    if (evaluation.requiresApproval) {
      const approvalPaths = evaluation.violations
        .filter((item) => item.rule === "require_approval")
        .map((item) => item.path)
        .filter((item): item is string => Boolean(item));
      return {
        ok: true,
        bondHash,
        requiresApproval: true,
        approvalPaths,
        detail: "Operator /approve required before writing these paths.",
      };
    }
    return { ok: true, bondHash };
  }
  const primary = primaryBlockingRule(evaluation);
  return {
    ok: false,
    reason: primary?.rule ?? "bond_invalid",
    path: primary?.path,
    detail: primary?.detail,
  };
}

export function formatSealVerdict(result: SealTaskBondResult): Verdict {
  if (result.ok) {
    return formatTaskBondEvalVerdict(result.evaluation, result.bond.bondHash);
  }
  return formatTaskBondEvalVerdict(result.evaluation);
}

export function formatMandateVerdict(evaluation: MandateEvaluation): Verdict {
  if (!evaluation.passed) {
    const forbidden = evaluation.violations.find(
      (item) => item.rule === "forbidden",
    );
    return {
      ok: false,
      reason: forbidden ? "forbidden_prefix" : "mandate_violation",
      path: evaluation.violations[0]?.path,
      detail: evaluation.violations[0]?.prefix,
    };
  }
  if (evaluation.requiresApproval) {
    const approvalPaths = evaluation.violations
      .filter((item) => item.rule === "require_approval")
      .map((item) => item.path);
    return {
      ok: true,
      requiresApproval: true,
      approvalPaths,
      detail: "Operator /approve required before writing these paths.",
    };
  }
  return { ok: true };
}

export function envelopeFromVerdict(verdict: Verdict): Record<string, unknown> {
  if (verdict.ok) {
    return {
      ok: true,
      ...(verdict.bondHash ? { bondHash: verdict.bondHash } : {}),
      ...(verdict.requiresApproval ? { requiresApproval: true } : {}),
      ...(verdict.approvalPaths?.length
        ? { approvalPaths: verdict.approvalPaths }
        : {}),
      ...(verdict.detail ? { detail: verdict.detail } : {}),
    };
  }
  return {
    ok: false,
    reason: verdict.reason,
    ...(verdict.path ? { path: verdict.path } : {}),
    ...(verdict.detail ? { detail: verdict.detail } : {}),
  };
}
