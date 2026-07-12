import type { OSContext } from "../os/events.js";
import { getVibeDepth, renderDepthStatus, type VibeDepth } from "../os/depth.js";
import { readScoreboardEntries } from "../run/manifest.js";

export type CockpitManifest = {
  runId: string;
  vowsHash?: string;
  capsuleHash?: string;
  metrics?: {
    firstPassGreen?: boolean;
    gateIdsFailed?: string[];
    durationMs?: number;
    attempts?: number;
    tokensEstimate?: number;
  };
};

export function renderCockpitComment(
  state: string,
  context: OSContext,
  rootDir = ".",
  manifest?: CockpitManifest,
) {
  const depth = (context.vibeDepth ?? getVibeDepth()) as VibeDepth;
  return [
    "## Vibe Engine OS Cockpit",
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
    manifest?.capsuleHash
      ? `**Validate:** MCP \`validate_capsule\` with run_id \`${manifest.runId}\``
      : undefined,
    "",
    "### Changed Files",
    renderChangedFiles(context),
    "",
    "### Latest Failures",
    renderFailures(context),
    "",
    "### Scoreboard (last 20 runs)",
    renderScoreboardSummary(rootDir),
    "",
    "### Rollback",
    "Rollback metadata is recorded in `.runs/<runId>/ROLLBACK.md` after a verified generated run.",
    "",
    "### Commands",
    "`/plan` `/approve` `/retry` `/rollback` `/status` `/deploy`",
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function renderScoreboardSummary(rootDir = "."): string {
  const entries = readScoreboardEntries(rootDir, 20);
  if (entries.length === 0) return "No runs recorded yet.";

  const successCount = entries.filter((entry) => entry.success).length;
  const firstPassCount = entries.filter(
    (entry) => entry.metrics.firstPassGreen,
  ).length;
  const avgDuration =
    entries.reduce((sum, entry) => sum + entry.metrics.durationMs, 0) /
    entries.length;
  const gateRuns = entries.filter((entry) =>
    entry.metrics.gateIdsFailed.length === 0 && entry.metrics.attempts <= 1,
  ).length;
  const tokensSavedEstimate = gateRuns * 4000;

  return [
    `- **Success rate:** ${((successCount / entries.length) * 100).toFixed(0)}% (${successCount}/${entries.length})`,
    `- **First-pass rate:** ${((firstPassCount / entries.length) * 100).toFixed(0)}%`,
    `- **Avg duration:** ${avgDuration.toFixed(0)}ms`,
    `- **Tokens saved (est.):** ~${tokensSavedEstimate} (gate vs LLM path)`,
  ].join("\n");
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
