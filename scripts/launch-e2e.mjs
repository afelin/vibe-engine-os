#!/usr/bin/env node
/**
 * Zero-token launch proof: create issue → poll PR + receipt → verify checks.
 * Requires gh CLI and GITHUB_TOKEN/GH_TOKEN.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const POLL_INTERVAL_MS = 15_000;
const FOREVER_MAX_WAIT_MS = 25 * 60 * 1000;
const PROOF_MAX_WAIT_MS = 30 * 60 * 1000;
const CHECKS_MAX_WAIT_MS = 25 * 60 * 1000;

const ISSUE_BODY = `### Intent
Launch proof zero-token cloud loop

### Outcome
- cloud-loop-smoke.ts passes tests
- PR opens with green promotion gate

### Files to touch
src/cloud-loop-smoke.ts
src/cloud-loop-smoke.test.ts
`;

function ghJson(args) {
  const output = execSync(`gh ${args}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  }).trim();
  return output ? JSON.parse(output) : null;
}

function ghText(args) {
  return execSync(`gh ${args}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  }).trim();
}

const REQUIRED_LABELS = [
  { name: "vibe/run", color: "1D76DB", description: "Trigger vibe-engine sovereign loop" },
  { name: "vibe:safe", color: "0E8A16", description: "Safe depth codegen" },
];

function ensureVibeLabels() {
  for (const label of REQUIRED_LABELS) {
    try {
      ghText(
        `label create "${label.name}" --color "${label.color}" --description "${label.description}" --force`,
      );
    } catch {
      // label may already exist with different metadata
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPrUrl(text) {
  const patterns = [
    /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/i,
    /\[Open PR\]\((https:\/\/github\.com\/[^)]+)\)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1] ?? match[0];
  }
  return undefined;
}

function extractCapsuleHash(text) {
  const match = text.match(/sha256:([a-f0-9]{64})/i);
  return match?.[1];
}

function resolvePrUrlForIssue(issueNumber, repo) {
  const owner = repo.split("/")[0];
  const branch = `vibe/issue-${issueNumber}`;
  try {
    const prs = ghJson(
      `pr list --head ${owner}:${branch} --state open --json url --limit 1`,
    );
    return prs?.[0]?.url;
  } catch {
    return undefined;
  }
}

async function dispatchAndWatchForever(issueNumber) {
  const ref = process.env.VIBE_LAUNCH_REF?.trim() || "main";
  const beforeRuns = ghJson(
    "run list --workflow=forever.yml --limit=3 --json databaseId",
  );
  const beforeId = beforeRuns?.[0]?.databaseId ?? 0;

  ghText(`workflow run forever.yml --ref ${ref} -f issue_number=${issueNumber}`);
  process.stdout.write(
    `Dispatched forever.yml for issue #${issueNumber} (GITHUB_TOKEN-created issues do not auto-trigger workflows)\n`,
  );

  const started = Date.now();
  let runId;
  while (Date.now() - started < 120_000) {
    await sleep(5_000);
    const runs = ghJson(
      "run list --workflow=forever.yml --limit=8 --json databaseId,status,conclusion,event,createdAt",
    );
    const fresh = runs?.find(
      (run) =>
        run.event === "workflow_dispatch" && run.databaseId > beforeId,
    );
    if (fresh?.databaseId) {
      runId = fresh.databaseId;
      if (fresh.status === "completed") break;
    }
  }

  if (!runId) {
    throw new Error(
      `forever.yml did not start within 2 minutes for issue #${issueNumber}`,
    );
  }

  process.stdout.write(`Watching forever.yml run ${runId}…\n`);
  const watchStarted = Date.now();
  try {
    execSync(`gh run watch ${runId} --exit-status`, {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    const run = ghJson(`run view ${runId} --json conclusion,url`);
    throw new Error(
      `forever.yml run ${runId} failed (${run?.conclusion ?? "unknown"}). ` +
        `Check vibe-promote (often missing .runs artifact — include-hidden-files). ${run?.url ?? ""}`,
    );
  }

  if (Date.now() - watchStarted > FOREVER_MAX_WAIT_MS) {
    throw new Error(`forever.yml run ${runId} exceeded ${FOREVER_MAX_WAIT_MS / 60000}m`);
  }

  return runId;
}

async function waitForIssueProof(issueNumber, repo) {
  const started = Date.now();
  let prUrl;
  let capsuleHash;
  let receiptLink;
  let lastStatus = "";

  while (Date.now() - started < PROOF_MAX_WAIT_MS) {
    const payload = ghJson(`issue view ${issueNumber} --json comments`);
    const bodies = (payload.comments ?? [])
      .map((comment) => comment.body ?? "")
      .join("\n");

    prUrl = prUrl ?? extractPrUrl(bodies) ?? resolvePrUrlForIssue(issueNumber, repo);
    capsuleHash = capsuleHash ?? extractCapsuleHash(bodies);
    if (/View proof/i.test(bodies)) {
      const linkMatch = bodies.match(/\[View proof\]\(([^)]+)\)/i);
      receiptLink = linkMatch?.[1];
    }

    if (prUrl && (capsuleHash || receiptLink)) {
      return { prUrl, capsuleHash, receiptLink };
    }

    const missing = [];
    if (!prUrl) missing.push("PR (comment or vibe/issue-* branch)");
    if (!capsuleHash && !receiptLink) missing.push("receipt/capsule in comments");
    const status = `… waiting on issue #${issueNumber}: ${missing.join(", ")}`;
    if (status !== lastStatus) {
      process.stdout.write(`${status}\n`);
      lastStatus = status;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${PROOF_MAX_WAIT_MS / 60000}m waiting for PR + receipt on issue #${issueNumber}. ` +
      `Have: pr=${Boolean(prUrl)} receipt=${Boolean(receiptLink)} capsule=${Boolean(capsuleHash)}. ` +
      "If receipt exists but no PR, vibe-promote likely failed (see forever.yml artifact upload).",
  );
}

async function waitForPrChecks(prUrl) {
  const started = Date.now();
  const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!prNumber) throw new Error(`Cannot parse PR number from ${prUrl}`);

  while (Date.now() - started < CHECKS_MAX_WAIT_MS) {
    const checks = ghJson(`pr checks ${prNumber} --json name,state,bucket`);
    const checkList = Array.isArray(checks) ? checks : checks?.checks ?? [];
    const gate = checkList.find((check) => check.name === "Vibe Promotion Gate");
    const attribution = checkList.find(
      (check) => check.name === "Audit Assisted-by attribution",
    );

    const gateGreen =
      gate?.state === "SUCCESS" ||
      gate?.state === "COMPLETED" ||
      gate?.bucket === "pass";
    const attrGreen =
      !attribution ||
      attribution.state === "SUCCESS" ||
      attribution.state === "COMPLETED" ||
      attribution.bucket === "pass";

    if (gate && gateGreen && attrGreen) {
      return {
        checksGreen: true,
        checkNames: checkList.map((check) => check.name),
        gateConclusion: gate.state ?? gate.bucket,
      };
    }

    process.stdout.write(`… waiting for PR checks on #${prNumber}\n`);
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${CHECKS_MAX_WAIT_MS / 60000}m waiting for green checks on ${prUrl}`,
  );
}

async function main() {
  if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
    console.error("GITHUB_TOKEN or GH_TOKEN required");
    process.exit(1);
  }

  const repo = ghText("repo view --json nameWithOwner -q .nameWithOwner");
  process.stdout.write(`Launch proof on ${repo}\n`);

  ensureVibeLabels();

  const bodyFile = path.join(os.tmpdir(), "vibe-launch-proof-body.md");
  fs.writeFileSync(bodyFile, ISSUE_BODY, "utf8");

  const created = ghText(
    `issue create --title "[vibe] Launch proof zero-token cloud loop" --label "vibe/run,vibe:safe" --body-file "${bodyFile}"`,
  );
  fs.unlinkSync(bodyFile);

  const numMatch = created.match(/\/issues\/(\d+)/);
  if (!numMatch) throw new Error(`Unexpected issue create output: ${created}`);
  const issueNumber = Number(numMatch[1]);

  process.stdout.write(`Created issue #${issueNumber}\n`);

  if (process.env.GITHUB_ACTIONS === "true") {
    await dispatchAndWatchForever(issueNumber);
  }

  const { prUrl, capsuleHash, receiptLink } = await waitForIssueProof(
    issueNumber,
    repo,
  );
  process.stdout.write(`PR: ${prUrl}\n`);

  const checkResult = await waitForPrChecks(prUrl);

  const proof = {
    recordedAt: new Date().toISOString(),
    repository: repo,
    issueNumber,
    issueUrl: `https://github.com/${repo}/issues/${issueNumber}`,
    prUrl,
    capsuleHash: capsuleHash ?? null,
    receiptLink: receiptLink ?? null,
    checksGreen: checkResult.checksGreen,
    checkNames: checkResult.checkNames,
    gateConclusion: checkResult.gateConclusion,
    mode: "zero-token",
  };

  const outDir = path.join(".vibe");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "launch-proof.json");
  if (!receiptLink) {
    process.stdout.write(
      "Note: receipt link not in issue comments yet (private repos may 404 hosted proof URLs until Pages is enabled — not a launch blocker).\n",
    );
  }

  fs.writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${outPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
