import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildProofHpurl,
  DEFAULT_PROOF_BASE,
} from "../constitution/hpurl.js";
import type { OSContext } from "../os/events.js";
import { getVibeDepth, renderDepthStatus, type VibeDepth } from "../os/depth.js";
import { readTaskBond } from "../bond/store.js";
import { readScoreboardEntries } from "../run/manifest.js";
import { countGauntletCases } from "../launch/readiness.js";
import { readInterventions } from "../research/interventions.js";
import {
  renderDecisionExplain,
  resolveCockpitDecisionId,
  resolveExplainDepth,
} from "./explain.js";

export function resolvePrUrl(rootDir = "."): string | undefined {
  const fromEnv = process.env.VIBE_PR_URL?.trim();
  if (fromEnv) return fromEnv;

  const filePath = path.join(rootDir, ".runs", "pr-url.txt");
  if (!fs.existsSync(filePath)) return undefined;

  const value = fs.readFileSync(filePath, "utf8").trim();
  return value || undefined;
}

export type CockpitManifest = {
  runId: string;
  vowsHash?: string;
  capsuleHash?: string;
  repository?: string;
  proofBase?: string;
  prUrl?: string;
  metrics?: {
    firstPassGreen?: boolean;
    gateIdsFailed?: string[];
    durationMs?: number;
    attempts?: number;
    tokensEstimate?: number;
    hallucinationBlocked?: boolean;
  };
};

export type CockpitRenderOptions = {
  expandTechnical?: boolean;
};

const NEXT_ACTION_BY_STATE: Record<string, string> = {
  received: "The engine is starting. No action needed yet.",
  preflight: "Preflight checks are running. Wait for the next update.",
  planning: "The planner is building an execution plan. Wait for the next update.",
  risk_review: "Risk review is in progress. Wait for the next update.",
  awaiting_approval:
    "A protected change needs your OK. Comment `/approve` on this issue to continue.",
  generating_patch: "Code is being generated. Wait for verification.",
  verifying: "Tests and gates are running. Wait for the result.",
  learning: "A failure was recorded. Comment `/retry` to try again or `/rollback` for instructions.",
  publishing: "Opening or updating your pull request.",
  completed: "Review the PR link above and merge when CI is green.",
  failed: "Read the failure summary below. Fix the issue body or comment `/retry`.",
  operator_command: "Use `/status` for a fresh snapshot or `/continue` to resume a paused run.",
};


function renderExplainBlock(
  state: string,
  labels?: string,
): string | undefined {
  const depth = resolveExplainDepth({ labels });
  if (depth === "off") return undefined;
  const decisionId = resolveCockpitDecisionId(state);
  if (!decisionId) return undefined;
  const block = renderDecisionExplain(decisionId, depth);
  return block || undefined;
}

export function resolveNextAction(state: string): string {
  return NEXT_ACTION_BY_STATE[state] ?? "Wait for the engine to post the next update.";
}

export function shouldExpandTechnical(
  labels?: string,
  commandBody?: string,
  options?: CockpitRenderOptions,
): boolean {
  if (options?.expandTechnical) return true;
  if (commandBody?.trim().toLowerCase().startsWith("/details")) return true;
  if (!labels) return false;
  return labels
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .includes("vibe:technical");
}

export function renderCockpitComment(
  state: string,
  context: OSContext,
  rootDir = ".",
  manifest?: CockpitManifest,
  options?: CockpitRenderOptions & { labels?: string; commandBody?: string },
) {
  const depth = (context.vibeDepth ?? getVibeDepth()) as VibeDepth;
  const prUrl = manifest?.prUrl ?? resolvePrUrl(rootDir);
  const bond = readTaskBond(rootDir, context.issueNumber);
  const expandTechnical = shouldExpandTechnical(
    options?.labels,
    options?.commandBody,
    options,
  );
  const nextAction = resolveNextAction(state);
  const plainReceipt = renderPlainReceiptLine(manifest);
  const gauntletLine = renderGauntletLine(rootDir);
  const tokensSavedLine = renderTokensSavedLine(manifest);

  const plainBlock = [
    "## Vibe Engine OS",
    "",
    prUrl ? `**Pull request:** [Open PR](${prUrl})` : undefined,
    prUrl ? "" : undefined,
    plainReceipt,
    plainReceipt ? "" : undefined,
    gauntletLine,
    gauntletLine ? "" : undefined,
    tokensSavedLine,
    tokensSavedLine ? "" : undefined,
    "### What's happening",
    describeWhatsHappening(state, context),
    "",
    "### Next step",
    nextAction,
    "",
    "### Outcome checklist",
    renderOutcomeChecklist(bond?.outcomes ?? []),
    "",
    renderExplainBlock(state, options?.labels),
    renderExplainBlock(state, options?.labels) ? "" : undefined,
    "### Commands",
    "`/status` · `/approve` · `/continue` · `/retry` · `/rollback` · `/details`",
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  const technicalBlock = [
    expandTechnical ? "<details open>" : "<details>",
    expandTechnical
      ? "<summary>Technical details</summary>"
      : "<summary>Technical details (comment `/details` or add label `vibe:technical`)</summary>",
    "",
    `**State:** ${state}`,
    `**Issue:** #${context.issueNumber} ${context.issueTitle}`,
    renderDepthStatus(depth),
    `**Risk:** ${context.risk ?? "unreviewed"}`,
    context.riskReason ? `**Risk reason:** ${context.riskReason}` : undefined,
    `**Attempts:** ${context.attempts}/${context.maxAttempts}`,
    manifest?.capsuleHash
      ? `**Capsule:** \`sha256:${manifest.capsuleHash}\``
      : undefined,
    manifest?.vowsHash
      ? `**Vows:** \`sha256:${manifest.vowsHash}\``
      : undefined,
    renderReceiptLine(manifest),
    "",
    "### Changed files",
    renderChangedFiles(context),
    "",
    "### Latest failures",
    renderFailures(context),
    "",
    "### Scoreboard",
    renderScoreboardSummary(rootDir, manifest),
    "",
    "### Rollback",
    "Rollback metadata is recorded in `.runs/<runId>/ROLLBACK.md` after a verified generated run.",
    "",
    "</details>",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  return `${plainBlock}\n${technicalBlock}`;
}

function describeWhatsHappening(state: string, context: OSContext): string {
  switch (state) {
    case "awaiting_approval":
      return `Paused on a protected change (${context.risk ?? "high"} risk). Your approval unblocks codegen.`;
    case "learning":
      return context.failures.length > 0
        ? `Last attempt failed: ${context.failures[context.failures.length - 1]?.symptom ?? "see failures below"}.`
        : "Recovering from a failed verification pass.";
    case "completed":
      return "Run finished. Your PR and receipt are ready for review.";
    case "failed":
      return "Run stopped before promotion. See failures or fix the issue request.";
    case "generating_patch":
    case "verifying":
      return "Building and verifying code within your TaskBond file scope.";
    case "planning":
    case "risk_review":
      return "Planning and safety review before any files are written.";
    default:
      return `Engine state: ${state}.`;
  }
}

function renderOutcomeChecklist(outcomes: string[]): string {
  if (outcomes.length === 0) {
    return "- No outcomes listed in the TaskBond. Add an **Outcome** section to your issue.";
  }
  return outcomes.map((outcome) => `- [ ] ${outcome}`).join("\n");
}

export function renderScoreboardSummary(
  rootDir = ".",
  manifest?: CockpitManifest,
): string {
  const entries = readScoreboardEntries(rootDir, 20);
  if (entries.length === 0) return "No runs recorded yet.";

  const successCount = entries.filter((entry) => entry.success).length;
  const firstPassCount = entries.filter(
    (entry) => entry.metrics.firstPassGreen,
  ).length;
  const hallucinationCount = entries.filter(
    (entry) => entry.metrics.hallucinationBlocked,
  ).length;
  const avgDuration =
    entries.reduce((sum, entry) => sum + entry.metrics.durationMs, 0) /
    entries.length;
  const gateRuns = entries.filter((entry) =>
    entry.metrics.gateIdsFailed.length === 0 && entry.metrics.attempts <= 1,
  ).length;
  const tokensSavedEstimate = gateRuns * 4000;
  const interventions = readInterventions(rootDir, 50);

  const lines = [
    `- **Success rate:** ${((successCount / entries.length) * 100).toFixed(0)}% (${successCount}/${entries.length})`,
    `- **First-pass rate:** ${((firstPassCount / entries.length) * 100).toFixed(0)}%`,
    `- **Hallucination blocks:** ${hallucinationCount} run(s) stopped off-scope paths`,
    `- **Avg duration:** ${avgDuration.toFixed(0)}ms`,
    `- **Tokens saved (est.):** ~${tokensSavedEstimate} (gate vs LLM path)`,
    `- **Policy interventions:** ${interventions.length} recorded`,
  ];

  if (manifest?.metrics?.firstPassGreen !== undefined) {
    lines.unshift(
      `- **This run first-pass:** ${manifest.metrics.firstPassGreen ? "yes" : "no"}${
        manifest.metrics.hallucinationBlocked ? " (hallucination blocked)" : ""
      }`,
    );
  }

  return lines.join("\n");
}

function renderPlainReceiptLine(manifest?: CockpitManifest): string | undefined {
  if (!manifest?.capsuleHash || !manifest.vowsHash) return undefined;

  const proofBase =
    manifest.proofBase ??
    process.env.VIBE_PROOF_BASE ??
    DEFAULT_PROOF_BASE;
  const repository =
    manifest.repository ?? process.env.GITHUB_REPOSITORY ?? undefined;

  const proofUrl = buildProofHpurl(proofBase, {
    runId: manifest.runId,
    capsuleHash: manifest.capsuleHash,
    vowsHash: manifest.vowsHash,
    repo: repository,
  });

  return `**Receipt verified:** [View proof](${proofUrl})`;
}

export function renderGauntletLine(rootDir = "."): string | undefined {
  const gauntlet = countGauntletCases(rootDir);
  if (!gauntlet) return undefined;
  if (gauntlet.pass === gauntlet.total) {
    return `**Gauntlet:** ${gauntlet.pass}/${gauntlet.total} green`;
  }
  return `**Gauntlet:** ${gauntlet.pass}/${gauntlet.total} (${gauntlet.total - gauntlet.pass} failing)`;
}

export function renderTokensSavedLine(manifest?: CockpitManifest): string | undefined {
  const tokens = manifest?.metrics?.tokensEstimate;
  const zeroToken =
    tokens === 0 ||
    (tokens === undefined &&
      manifest?.metrics?.firstPassGreen &&
      (manifest.metrics.gateIdsFailed?.length ?? 0) === 0);

  if (!zeroToken) return undefined;
  return "**This run saved ~4000 tokens** (zero-token gate path)";
}

function renderReceiptLine(manifest?: CockpitManifest): string | undefined {
  if (!manifest?.capsuleHash || !manifest.vowsHash) return undefined;

  const proofBase =
    manifest.proofBase ??
    process.env.VIBE_PROOF_BASE ??
    DEFAULT_PROOF_BASE;
  const repository =
    manifest.repository ?? process.env.GITHUB_REPOSITORY ?? undefined;

  const proofUrl = buildProofHpurl(proofBase, {
    runId: manifest.runId,
    capsuleHash: manifest.capsuleHash,
    vowsHash: manifest.vowsHash,
    repo: repository,
  });

  return [
    `**Receipt:** [View proof](${proofUrl})`,
    `Fallback: MCP \`validate_capsule\` with run_id \`${manifest.runId}\``,
  ].join(" — ");
}

function renderChangedFiles(context: OSContext) {
  if (context.generatedFiles.length === 0) return "No generated files yet.";
  return context.generatedFiles.map((file) => `- ${file.path}`).join("\n");
}

function renderFailures(context: OSContext) {
  if (context.failures.length === 0) return "No failures recorded.";
  return context.failures
    .map((failure) => `- ${failure.failureClass}: ${failure.symptom}`)
    .join("\n");
}
