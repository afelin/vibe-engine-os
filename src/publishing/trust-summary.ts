import {
  buildProofHpurl,
  DEFAULT_PROOF_BASE,
} from "../constitution/hpurl.js";
import { resolveNextAction } from "../operator/cockpit.js";
import { loadActiveStack } from "../policy/stackables.js";
import {
  evaluateMergeReadiness,
  pickAttributionCheck,
  pickPromotionCheck,
  type CheckRunSnapshot,
  type PullRequestSnapshot,
} from "../promote/auto-merge.js";
import {
  ATTRIBUTION_CHECK_NAME,
  PROMOTION_CHECK_NAME,
} from "./github-checks.js";

/** Marker for marked upsert of the trust summary block in PR comments. */
export const trustSummaryCommentMarker =
  "<!-- vibe-engine-os-trust-summary -->";

export type TrustApprovalState = "not_required" | "pending" | "approved";

export type TrustSummaryContext = {
  state?: string;
  approvalState?: TrustApprovalState;
  approvalRequired?: boolean;
  approved?: boolean;
  runId?: string;
  capsuleHash?: string;
  vowsHash?: string;
  repository?: string;
  proofBase?: string;
  /** Explicit legal space id. When omitted, loaded from `rootDir` if set. */
  legalSpace?: string | null;
  /** AgentId / authorized_actor for HPURL agent= param. */
  agent?: string | null;
  rootDir?: string;
  pr?: PullRequestSnapshot | null;
  promotionCheck?: CheckRunSnapshot | null;
  attributionCheck?: CheckRunSnapshot | null;
  checks?: CheckRunSnapshot[];
};

function resolveLegalSpace(ctx: TrustSummaryContext): string | undefined {
  if (typeof ctx.legalSpace === "string" && ctx.legalSpace.trim()) {
    return ctx.legalSpace.trim();
  }
  if (ctx.legalSpace === null) return undefined;
  if (ctx.rootDir) {
    return loadActiveStack(ctx.rootDir)?.legalSpace;
  }
  return undefined;
}

function resolveApprovalState(ctx: TrustSummaryContext): TrustApprovalState {
  if (ctx.approvalState) return ctx.approvalState;
  if (ctx.approved === true) return "approved";
  if (ctx.approvalRequired === true) return "pending";
  if (ctx.state === "awaiting_approval") return "pending";
  return "not_required";
}

function formatCheckLine(
  label: string,
  check: CheckRunSnapshot | null | undefined,
): string {
  if (!check) {
    return `- **${label}:** missing`;
  }
  const done = check.status === "completed";
  const ok = done && check.conclusion === "success";
  const fail = done && check.conclusion === "failure";
  if (ok) return `- **${label}:** pass ✅`;
  if (fail) return `- **${label}:** fail ❌`;
  if (!done) {
    return `- **${label}:** ${check.status} (${check.conclusion ?? "pending"})`;
  }
  return `- **${label}:** ${check.conclusion ?? check.status}`;
}

function resolveChecks(ctx: TrustSummaryContext): {
  promotion: CheckRunSnapshot | null;
  attribution: CheckRunSnapshot | null;
} {
  if (ctx.checks) {
    return {
      promotion: pickPromotionCheck(ctx.checks),
      attribution: pickAttributionCheck(ctx.checks),
    };
  }
  return {
    promotion: ctx.promotionCheck ?? null,
    attribution: ctx.attributionCheck ?? null,
  };
}

function humanizeReason(reason: string): string {
  return reason.replace(/_/g, " ");
}

function resolveTrustNextAction(
  ctx: TrustSummaryContext,
  readinessReason: string | undefined,
  readinessOk: boolean | undefined,
  approval: TrustApprovalState,
): string {
  if (readinessOk === false && readinessReason) {
    return `Blocked: ${readinessReason} — fix required checks, then merge when green.`;
  }
  if (approval === "pending") {
    return resolveNextAction("awaiting_approval");
  }
  return resolveNextAction(ctx.state ?? "completed");
}

/**
 * One-screen trust loop: checks, approval, capsule/HPURL, legal space, next action.
 */
export function renderTrustSummary(ctx: TrustSummaryContext): string {
  const legalSpace = resolveLegalSpace(ctx);
  const approval = resolveApprovalState(ctx);
  const { promotion, attribution } = resolveChecks(ctx);

  const lines: string[] = ["## Trust summary", "", "### Checks"];

  lines.push(formatCheckLine(PROMOTION_CHECK_NAME, promotion));
  lines.push(formatCheckLine(ATTRIBUTION_CHECK_NAME, attribution));

  let readinessOk: boolean | undefined;
  let readinessReason: string | undefined;

  if (ctx.pr) {
    const verdict = evaluateMergeReadiness(ctx.pr, promotion, attribution);
    readinessOk = verdict.ok;
    readinessReason = verdict.reason;
    if (verdict.ok) {
      lines.push(`- **Merge readiness:** ready (${verdict.reason})`);
    } else {
      lines.push(
        `- **Merge readiness:** blocked — \`${verdict.reason}\` (${humanizeReason(verdict.reason)})`,
      );
    }
  } else {
    lines.push("- **Merge readiness:** unknown (no PR snapshot)");
  }

  lines.push("", "### Approval");
  switch (approval) {
    case "approved":
      lines.push("Approved.");
      break;
    case "pending":
      lines.push("Pending — comment `/approve` on the issue to continue.");
      break;
    default:
      lines.push("Not required.");
  }

  lines.push("", "### Replay");
  if (ctx.capsuleHash) {
    lines.push(`- **Capsule:** \`sha256:${ctx.capsuleHash}\``);
  } else {
    lines.push("- **Capsule:** not recorded");
  }
  if (ctx.vowsHash) {
    lines.push(`- **Vows:** \`sha256:${ctx.vowsHash}\``);
  }

  if (ctx.runId && ctx.capsuleHash && ctx.vowsHash) {
    const proofBase =
      ctx.proofBase ?? process.env.VIBE_PROOF_BASE ?? DEFAULT_PROOF_BASE;
    const space =
      legalSpace && legalSpace !== "none" ? legalSpace : undefined;
    const agent =
      typeof ctx.agent === "string" && ctx.agent.trim()
        ? ctx.agent.trim()
        : undefined;
    const proofUrl = buildProofHpurl(proofBase, {
      runId: ctx.runId,
      capsuleHash: ctx.capsuleHash,
      vowsHash: ctx.vowsHash,
      repo: ctx.repository,
      space,
      agent,
    });
    lines.push(`- **HPURL:** [View proof](${proofUrl})`);
  }

  if (legalSpace) {
    lines.push("", "### Legal space", `\`${legalSpace}\``);
  }

  const next = resolveTrustNextAction(
    ctx,
    readinessReason,
    readinessOk,
    approval,
  );
  lines.push("", "### Next action", next);

  return lines.join("\n");
}
