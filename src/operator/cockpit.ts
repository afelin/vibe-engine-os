import type { OSContext } from "../os/events.js";

export function renderCockpitComment(state: string, context: OSContext) {
  return [
    "## Vibe Engine OS Cockpit",
    "",
    `**State:** ${state}`,
    `**Issue:** #${context.issueNumber} ${context.issueTitle}`,
    `**Risk:** ${context.risk ?? "unreviewed"}`,
    context.riskReason ? `**Risk reason:** ${context.riskReason}` : undefined,
    `**Attempts:** ${context.attempts}/${context.maxAttempts}`,
    "",
    "### Changed Files",
    renderChangedFiles(context),
    "",
    "### Latest Failures",
    renderFailures(context),
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
