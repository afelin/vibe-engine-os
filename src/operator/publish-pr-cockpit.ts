import { readPersistedApproval } from "../os/approval-store.js";
import { readRunManifest } from "../run/manifest.js";
import { sanitizeRunId } from "../run/paths.js";
import { loadActiveStack } from "../policy/stackables.js";
import {
  publishCockpitComment,
  resolveGitHubCommentTarget,
} from "../publishing/github-comments.js";
import {
  renderTrustSummary,
  trustSummaryCommentMarker,
} from "../publishing/trust-summary.js";
import {
  formatStakeholderNarrativesSection,
  renderStakeholderNarratives,
  stakeholderNarrativesCommentMarker,
} from "../publishing/stakeholder-narratives.js";
import { renderCockpitComment, resolvePrUrl } from "./cockpit.js";
import {
  fetchCheckRunsForRef,
  fetchPullRequest,
  pickAttributionCheck,
  pickPromotionCheck,
  type CheckRunSnapshot,
  type PullRequestSnapshot,
} from "../promote/auto-merge.js";
import { parseRepository } from "../publishing/github-checks.js";

const rootDir = process.argv[2] ?? ".";
const runIdArg = process.argv[3] ?? process.env.RUN_ID ?? "";

function parsePrNumber(prUrl: string | undefined): number | undefined {
  if (!prUrl) return undefined;
  const match = prUrl.match(/\/pull\/(\d+)/);
  if (!match?.[1]) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

async function loadPrTrustContext(args: {
  token: string;
  repository: string;
  prUrl?: string;
}): Promise<{
  pr: PullRequestSnapshot | null;
  promotionCheck: CheckRunSnapshot | null;
  attributionCheck: CheckRunSnapshot | null;
}> {
  const pullNumber =
    parsePrNumber(args.prUrl) ??
    (process.env.VIBE_PR_NUMBER
      ? Number(process.env.VIBE_PR_NUMBER)
      : undefined);
  const parsed = parseRepository(args.repository);
  if (!parsed || !pullNumber || !Number.isFinite(pullNumber)) {
    return { pr: null, promotionCheck: null, attributionCheck: null };
  }

  try {
    const pr = await fetchPullRequest(
      fetch,
      args.token,
      parsed.owner,
      parsed.repo,
      pullNumber,
    );
    const checks = await fetchCheckRunsForRef(
      fetch,
      args.token,
      parsed.owner,
      parsed.repo,
      pr.head.sha,
    );
    return {
      pr,
      promotionCheck: pickPromotionCheck(checks),
      attributionCheck: pickAttributionCheck(checks),
    };
  } catch {
    return { pr: null, promotionCheck: null, attributionCheck: null };
  }
}

async function main() {
  if (!runIdArg) {
    console.log("No run id — skipping cockpit PR update");
    return;
  }

  const runId = sanitizeRunId(runIdArg);
  const manifest = readRunManifest(rootDir, runId);
  if (!manifest) {
    console.log(`No manifest for ${runId} — skipping cockpit PR update`);
    return;
  }

  const prUrl = resolvePrUrl(rootDir);
  if (!prUrl) {
    console.log("No PR URL — skipping cockpit PR update");
    return;
  }

  const target = resolveGitHubCommentTarget(process.env);
  if (!target.enabled) {
    console.log(`Cockpit PR update skipped: ${target.reason}`);
    return;
  }

  const approvalRecord = readPersistedApproval(rootDir, manifest.issueNumber);
  const approvalState = approvalRecord
    ? ("approved" as const)
    : manifest.approvalRequired
      ? ("pending" as const)
      : ("not_required" as const);

  const legalSpace = loadActiveStack(rootDir)?.legalSpace;
  const prTrust = await loadPrTrustContext({
    token: target.token,
    repository: target.repository,
    prUrl,
  });

  const trustSummary = renderTrustSummary({
    state: "completed",
    approvalState,
    approvalRequired: manifest.approvalRequired,
    approved: Boolean(approvalRecord),
    runId: manifest.runId,
    vowsHash: manifest.vowsHash,
    capsuleHash: manifest.capsuleHash,
    repository: target.repository,
    rootDir,
    legalSpace,
    pr: prTrust.pr,
    promotionCheck: prTrust.promotionCheck,
    attributionCheck: prTrust.attributionCheck,
  });

  const stakeholderNarratives = formatStakeholderNarrativesSection(
    renderStakeholderNarratives({
      runId: manifest.runId,
      issueNumber: manifest.issueNumber,
      issueTitle: manifest.issueTitle,
      capsuleHash: manifest.capsuleHash,
      vowsHash: manifest.vowsHash,
      approvalRequired: manifest.approvalRequired,
      metrics: manifest.metrics,
      success: true,
      state: "completed",
      legalSpace,
      rootDir,
    }),
  );

  const cockpitBody = renderCockpitComment(
    "completed",
    {
      issueNumber: manifest.issueNumber,
      issueTitle: manifest.issueTitle,
      issueBody: "",
      attempts: manifest.metrics?.attempts ?? 1,
      maxAttempts: 3,
      findings: [],
      generatedFiles: [],
      verificationResults: [],
      failures: [],
    },
    rootDir,
    {
      runId: manifest.runId,
      vowsHash: manifest.vowsHash,
      capsuleHash: manifest.capsuleHash,
      repository: target.repository,
      prUrl,
    },
  );

  // Marked upsert block: trust summary + stakeholder narratives ahead of cockpit.
  // Keep existing trust/cockpit markers intact for upsert matching.
  const body = [
    trustSummaryCommentMarker,
    trustSummary,
    "",
    stakeholderNarrativesCommentMarker,
    stakeholderNarratives,
    "",
    cockpitBody,
  ].join("\n");

  const result = await publishCockpitComment({
    token: target.token,
    repository: target.repository,
    issueNumber: target.issueNumber,
    body,
  });
  console.log(`Cockpit PR update ${result.status}: ${result.url ?? "no URL returned"}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Cockpit PR update failed:", message);
  process.exit(1);
});
