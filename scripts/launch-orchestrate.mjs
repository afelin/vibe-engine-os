#!/usr/bin/env node
/**
 * Idempotent launch ship pipeline: readiness → workflow proof → branch protection.
 */
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const POLL_INTERVAL_MS = 20_000;
const MAX_WAIT_MS = 50 * 60 * 1000;
const STATE_PATH = path.join(".vibe", "launch-ship-state.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ghText(args) {
  return execSync(`gh ${args}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  }).trim();
}

function ghJson(args) {
  const output = ghText(args);
  return output ? JSON.parse(output) : null;
}

function runReadiness() {
  execSync("npm run launch:readiness", {
    stdio: "inherit",
    env: process.env,
  });
}

function printExplain(decisionId) {
  const result = spawnSync(
    "npx",
    ["tsx", "-e", `import { resolveExplainDepth, renderDecisionExplain } from "./src/operator/explain.ts"; const d = resolveExplainDepth(); const t = renderDecisionExplain(${JSON.stringify(decisionId)}, d); if (t) process.stdout.write(t + "\\n");`],
    { encoding: "utf8", cwd: process.cwd(), env: process.env },
  );
  if (result.stdout?.trim()) process.stdout.write(result.stdout);
}

function assertGitPushOptional() {
  if (process.env.VIBE_LAUNCH_SKIP_PUSH_CHECK === "1") return { ok: true, skipped: true };
  const status = execSync("git status -sb", { encoding: "utf8" }).trim();
  const aheadMatch = status.match(/ahead (\d+)/);
  if (aheadMatch && Number(aheadMatch[1]) > 0) {
    throw new Error(
      `Local branch is ahead by ${aheadMatch[1]} commit(s). Push to origin before launch proof.`,
    );
  }
  return { ok: true, status: status.split("\n")[0] };
}

async function triggerAndPollLaunchProof() {
  const ref = process.env.VIBE_LAUNCH_REF?.trim() || "main";
  ghText(`workflow run launch-proof.yml --ref ${ref}`);

  let runId;
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    await sleep(5_000);
    const runs = ghJson(
      `run list --workflow=launch-proof.yml --branch=${ref} --limit=3 --json databaseId,status,conclusion,createdAt`,
    );
    const queued = runs?.find((run) => run.status !== "completed");
    const latest = queued ?? runs?.[0];
    if (latest?.databaseId) {
      runId = latest.databaseId;
      if (latest.status === "completed") break;
    }
  }

  if (!runId) throw new Error("Could not find launch-proof workflow run");

  process.stdout.write(`Watching workflow run ${runId}…\n`);
  execSync(`gh run watch ${runId} --exit-status`, {
    stdio: "inherit",
    env: process.env,
  });

  const run = ghJson(`run view ${runId} --json conclusion,url,updatedAt`);
  if (run.conclusion !== "success") {
    throw new Error(`launch-proof failed: ${run.conclusion} (${run.url})`);
  }

  let proof = null;
  const proofPath = path.join(".vibe", "launch-proof.json");
  if (fs.existsSync(proofPath)) {
    proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  }

  return { runId, runUrl: run.url, proof };
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function main() {
  const startedAt = new Date().toISOString();
  const state = {
    startedAt,
    finishedAt: null,
    readiness: null,
    pushCheck: null,
    workflow: null,
    branchProtection: null,
    ok: false,
  };

  try {
    printExplain("launch.readiness");
    runReadiness();
    state.readiness = { ok: true, at: new Date().toISOString() };

    printExplain("launch.proof");
    state.pushCheck = assertGitPushOptional();

    const workflow = await triggerAndPollLaunchProof();
    state.workflow = {
      ok: true,
      runId: workflow.runId,
      url: workflow.runUrl,
      proof: workflow.proof,
    };

    printExplain("launch.branch_protection");
    const bp = await import("./enable-branch-protection.mjs").then((m) =>
      m.enableBranchProtection(),
    );
    state.branchProtection = bp;

    state.ok = bp.ok !== false && state.workflow.ok;
    state.finishedAt = new Date().toISOString();
    writeState(state);

    if (!bp.ok) {
      process.stderr.write(
        "Launch proof succeeded; branch protection needs manual or PAT admin step.\n",
      );
      process.exit(2);
    }

    process.stdout.write("launch:ship complete\n");
  } catch (error) {
    state.finishedAt = new Date().toISOString();
    state.error = error instanceof Error ? error.message : String(error);
    writeState(state);
    console.error(state.error);
    process.exit(1);
  }
}

main();
