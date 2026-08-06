import {
  loadActiveStack,
  loadLegalSpacePack,
  type LegalSpacePack,
} from "../policy/stackables.js";
import type { RunManifest, RunMetrics } from "../run/manifest.js";

/** Marker for marked upsert of stakeholder narratives in PR comments. */
export const stakeholderNarrativesCommentMarker =
  "<!-- vibe-engine-os-stakeholder-narratives -->";

export type StakeholderNarrativesManifest = {
  runId: string;
  issueNumber?: string;
  issueTitle?: string;
  capsuleHash?: string;
  vowsHash?: string;
  approvalRequired?: boolean;
  metrics?: Partial<RunMetrics>;
  /** Scoreboard / trust enrichment when available. */
  success?: boolean;
  state?: string;
  /** Explicit legal space id. When omitted, loaded from `rootDir` if set. */
  legalSpace?: string | null;
  rootDir?: string;
  /** Optional pack overrides (tests / callers that already loaded the pack). */
  narrativeTags?: string[];
  regimes?: string[];
  legalSpaceTitle?: string;
};

export type StakeholderNarratives = {
  ops: string;
  compliance: string;
  investor: string;
};

function resolveLegalSpace(
  manifest: StakeholderNarrativesManifest,
): string | undefined {
  if (typeof manifest.legalSpace === "string" && manifest.legalSpace.trim()) {
    return manifest.legalSpace.trim();
  }
  if (manifest.legalSpace === null) return undefined;
  if (manifest.rootDir) {
    return loadActiveStack(manifest.rootDir)?.legalSpace;
  }
  return undefined;
}

function resolvePack(
  spaceId: string | undefined,
  rootDir: string | undefined,
): LegalSpacePack | null {
  if (!spaceId || spaceId === "none") return null;
  try {
    return loadLegalSpacePack(spaceId, rootDir ?? ".");
  } catch {
    return null;
  }
}

function healLabel(metrics: Partial<RunMetrics> | undefined): string {
  if (!metrics) return "no heal recorded";
  if (metrics.deterministicFix === true && metrics.healLevel === 0) {
    return "L0 deterministic heal (zero-token)";
  }
  if (typeof metrics.healLevel === "number") {
    const outcome = metrics.healOutcome ? ` · ${metrics.healOutcome}` : "";
    return `heal L${metrics.healLevel}${outcome}`;
  }
  if (metrics.healOutcome) return String(metrics.healOutcome);
  return "no heal recorded";
}

function renderOps(manifest: StakeholderNarrativesManifest): string {
  const metrics = manifest.metrics ?? {};
  const attempts =
    typeof metrics.attempts === "number" ? metrics.attempts : undefined;
  const gates = Array.isArray(metrics.gateIdsFailed)
    ? metrics.gateIdsFailed
    : [];
  const state = manifest.state ?? (manifest.success === false ? "failed" : "completed");
  const success =
    manifest.success === true
      ? "success"
      : manifest.success === false
        ? "failed"
        : "status unknown";

  const parts = [
    `Ops: run \`${manifest.runId}\` ended ${success} (state: ${state}).`,
    attempts !== undefined ? `Attempts: ${attempts}.` : null,
    `Heal: ${healLabel(metrics)}.`,
    gates.length > 0
      ? `Gates failed: ${gates.join(", ")}.`
      : "No gate failures recorded.",
    manifest.issueTitle
      ? `Issue: #${manifest.issueNumber ?? "?"} — ${manifest.issueTitle}.`
      : null,
  ];

  return parts.filter(Boolean).join(" ");
}

function renderCompliance(
  manifest: StakeholderNarrativesManifest,
  spaceId: string | undefined,
  pack: LegalSpacePack | null,
): string {
  const tags =
    manifest.narrativeTags ??
    pack?.narrative_tags ??
    [];
  const regimes =
    manifest.regimes ??
    pack?.cyberready_align?.regimes ??
    [];
  const title =
    manifest.legalSpaceTitle ??
    pack?.title ??
    (spaceId && spaceId !== "none" ? spaceId : "vibe mandates only");

  const parts: string[] = [
    `Compliance: governed under ${title}` +
      (spaceId ? ` (\`${spaceId}\`)` : " (`none`)") +
      ".",
  ];

  if (regimes.length > 0) {
    parts.push(`Regimes cited: ${regimes.join(", ")}.`);
  }
  if (tags.length > 0) {
    parts.push(`Narrative tags: ${tags.join(", ")}.`);
  }

  if (manifest.approvalRequired) {
    parts.push("Approval-gated paths were in scope for this run.");
  } else {
    parts.push("No approval gate required for this run.");
  }

  if (manifest.vowsHash) {
    parts.push(`Vows integrity: \`sha256:${manifest.vowsHash}\`.`);
  }
  if (manifest.capsuleHash) {
    parts.push(`Capsule receipt: \`sha256:${manifest.capsuleHash}\`.`);
  }

  return parts.join(" ");
}

function renderInvestor(manifest: StakeholderNarrativesManifest): string {
  const metrics = manifest.metrics ?? {};
  const firstPass =
    metrics.firstPassGreen === true
      ? "first-pass green"
      : metrics.firstPassGreen === false
        ? "required heal/retry before green"
        : "first-pass status unknown";
  const proof = manifest.capsuleHash
    ? `Tamper-evident capsule \`sha256:${manifest.capsuleHash}\` is on record.`
    : "Capsule proof not yet recorded.";
  const heal =
    metrics.deterministicFix === true && metrics.healLevel === 0
      ? "Zero-token L0 heal preserved agent budget."
      : "Run completed under bond + gate control.";

  return [
    `Investor: shipping control plane run \`${manifest.runId}\` — ${firstPass}.`,
    proof,
    heal,
    manifest.success === true
      ? "Outcome: promote-ready evidence path closed."
      : manifest.success === false
        ? "Outcome: failed — intervention or retry required before promote."
        : "Outcome: see trust summary for merge readiness.",
  ].join(" ");
}

/**
 * Deterministic ops / compliance / investor snippets for a run.
 * No LLM — templates only; compliance cites active legal-space pack when set.
 */
export function renderStakeholderNarratives(
  manifest: StakeholderNarrativesManifest | RunManifest,
): StakeholderNarratives {
  const ctx = manifest as StakeholderNarrativesManifest;
  const spaceId = resolveLegalSpace(ctx);
  const pack = resolvePack(spaceId, ctx.rootDir);

  return {
    ops: renderOps(ctx),
    compliance: renderCompliance(ctx, spaceId, pack),
    investor: renderInvestor(ctx),
  };
}

/** Markdown block suitable for PR trust/cockpit footers. */
export function formatStakeholderNarrativesSection(
  snippets: StakeholderNarratives,
): string {
  return [
    "## Stakeholder narratives",
    "",
    "### Ops",
    snippets.ops,
    "",
    "### Compliance",
    snippets.compliance,
    "",
    "### Investor",
    snippets.investor,
  ].join("\n");
}
