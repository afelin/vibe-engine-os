import * as fs from "node:fs";
import * as path from "node:path";
import { appendOperatorEvent } from "./src/os/event-ledger.js";
import { runOSActor } from "./src/os/run.js";
import { renderCockpitComment } from "./src/operator/cockpit.js";
import { routeGitHubComment } from "./src/operator/github-comment-router.js";
import { publishCockpitComment, resolveGitHubCommentTarget } from "./src/publishing/github-comments.js";
import { renderRollbackInstructions, writeRunManifest } from "./src/run/manifest.js";
import { readLatestRollbackInstructions } from "./src/run/rollback.js";

process.on("uncaughtException", (error: Error) => {
  console.error("Fatal uncaught exception:", error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});

const ISSUE_NUMBER = process.env.ISSUE_NUMBER || "000";
const ISSUE_TITLE = process.env.ISSUE_TITLE || "Vibe Request";
const ISSUE_BODY = process.env.ISSUE_BODY || "No details provided.";
const GITHUB_ACTOR = process.env.GITHUB_ACTOR || "unknown-actor";
const GITHUB_COMMENT_ID = process.env.GITHUB_COMMENT_ID || process.env.GITHUB_RUN_ID || "unknown-comment";

async function runOS() {
  console.log(`\n🚀 Booting Vibe Engine OS for Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);

  if (isOperatorCommentEvent()) {
    const route = routeGitHubComment({
      body: ISSUE_BODY,
      actor: GITHUB_ACTOR,
      commentId: GITHUB_COMMENT_ID,
      state: "operator_command",
      context: {
        issueNumber: ISSUE_NUMBER,
        issueTitle: ISSUE_TITLE,
        issueBody: ISSUE_BODY,
        attempts: 0,
        maxAttempts: 3,
        findings: [],
        generatedFiles: [],
        verificationResults: [],
        failures: [],
      },
      readRollback: () => readLatestRollbackInstructions("."),
    });

    if (route.handled) {
      console.log(`🧭 Operator command routed as typed event: ${route.event.type}`);
      appendOperatorEvent(".", route.event);
      markOperatorOnlyFromEnv();
      if (route.event.type === "approval.granted") {
        markApprovedBy(route.event.actor);
      }
      await publishCommentBodyFromEnv(route.responseBody);
      return;
    }
  }

  const result = await runOSActor({
    issueNumber: ISSUE_NUMBER,
    issueTitle: ISSUE_TITLE,
    issueBody: ISSUE_BODY,
    githubActor: GITHUB_ACTOR,
    approvedBy: process.env.APPROVED_BY,
  });

  if (result.manifest?.approvalRequired && !process.env.APPROVED_BY) {
    writeRunManifest(".", result.manifest);
    fs.writeFileSync(
      path.join(".runs", result.manifest.runId, "ROLLBACK.md"),
      renderRollbackInstructions(result.manifest),
    );
    markApprovalRequiredFromEnv();
    console.log("⏸️ High-risk change paused for /approve before promotion.");
    await publishCockpitFromEnv("awaiting_approval", {
      generatedFiles: [],
      failures: [],
      attempts: result.context.attempts,
      maxAttempts: result.context.maxAttempts,
    });
    return;
  }

  if (!result.success) {
    await publishCockpitFromEnv("failed", {
      generatedFiles: [],
      failures: result.recordedErrors.map((error) => ({
        failureClass: "model_output" as const,
        symptom: error.split("\n")[0] || "Circuit breaker tripped",
        output: error,
      })),
      attempts: result.context.attempts,
      maxAttempts: result.context.maxAttempts,
    });
    process.exit(1);
  }

  if (result.manifest) {
    writeRunManifest(".", result.manifest);
    fs.writeFileSync(
      path.join(".runs", result.manifest.runId, "ROLLBACK.md"),
      renderRollbackInstructions(result.manifest),
    );
    console.log(`🧭 Run manifest recorded: .runs/${result.manifest.runId}/manifest.json`);
    writeGeneratedFilesListFromEnv(result.manifest.generatedFiles);
  }

  await publishCockpitFromEnv("completed", {
    generatedFiles: result.generatedFiles,
    failures: [],
    attempts: result.context.attempts,
    maxAttempts: result.context.maxAttempts,
  });

  for (const file of result.generatedFiles) {
    if (file.path.includes("src/") && !file.path.includes(".test.ts")) {
      const skillDir = ".skills/actors";
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
      const skillName = path.basename(file.path);
      fs.writeFileSync(path.join(skillDir, skillName), file.content);
      console.log(`⚡ Skill Extracted: ${skillName}`);
    }
  }

  console.log("🎯 Handoff Complete. Engine spinning down.");
}

function isOperatorCommentEvent() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  return eventName === "issue_comment" || eventName === "pull_request_review";
}

function markOperatorOnlyFromEnv() {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) return;
  fs.appendFileSync(githubEnv, "VIBE_OPERATOR_ONLY=1\n", "utf8");
}

function markApprovalRequiredFromEnv() {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) return;
  fs.appendFileSync(githubEnv, "VIBE_APPROVAL_REQUIRED=1\n", "utf8");
}

function markApprovedBy(actor: string) {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) return;
  fs.appendFileSync(githubEnv, `APPROVED_BY=${actor}\n`, "utf8");
}

function writeGeneratedFilesListFromEnv(files: string[]) {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) return;
  const delimiter = `EOF_GENERATED_FILES_${Date.now()}`;
  fs.appendFileSync(
    githubEnv,
    `GENERATED_FILES<<${delimiter}\n${files.join("\n")}\n${delimiter}\n`,
    "utf8",
  );
}

async function publishCommentBodyFromEnv(body: string) {
  const target = resolveGitHubCommentTarget(process.env);
  if (!target.enabled) {
    console.log(`🧭 Operator comment skipped: ${target.reason}`);
    return;
  }

  try {
    const result = await publishCockpitComment({
      token: target.token,
      repository: target.repository,
      issueNumber: target.issueNumber,
      body,
    });
    console.log(`🧭 Operator comment ${result.status}: ${result.url ?? "no URL returned"}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("⚠️ Operator comment publish failed:", message);
  }
}

async function publishCockpitFromEnv(
  state: string,
  runState: {
    generatedFiles: Array<{ path: string; content: string }>;
    failures: Array<{ failureClass: "model_output"; symptom: string; output: string }>;
    attempts: number;
    maxAttempts: number;
  },
) {
  const target = resolveGitHubCommentTarget(process.env);
  if (!target.enabled) {
    console.log(`🧭 Cockpit comment skipped: ${target.reason}`);
    return;
  }

  const body = renderCockpitComment(state, {
    issueNumber: ISSUE_NUMBER,
    issueTitle: ISSUE_TITLE,
    issueBody: ISSUE_BODY,
    attempts: runState.attempts,
    maxAttempts: runState.maxAttempts,
    findings: [],
    generatedFiles: runState.generatedFiles,
    verificationResults: [],
    failures: runState.failures,
  });

  try {
    const result = await publishCockpitComment({
      token: target.token,
      repository: target.repository,
      issueNumber: target.issueNumber,
      body,
    });
    console.log(`🧭 Cockpit comment ${result.status}: ${result.url ?? "no URL returned"}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("⚠️ Cockpit comment publish failed:", message);
  }
}

runOS().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Fatal OS run failure:", message);
  process.exit(1);
});
