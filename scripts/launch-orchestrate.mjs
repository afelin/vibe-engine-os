#!/usr/bin/env node
/**
 * Idempotent launch ship pipeline: readiness → workflow proof → branch protection.
 */
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const POLL_INTERVAL_MS = 20_000;
const MAX_WAIT_MS = 75 * 60 * 1000;
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

function listInProgressLaunchProofRuns(ref) {
  try {
    const runs = ghJson(
      `run list --workflow=launch-proof.yml --branch=${ref} --limit=10 --json databaseId,status,url,createdAt`,
    );
    return (runs ?? []).filter((run) => run.status === "in_progress" || run.status === "queued");
  } catch {
    return [];
  }
}

async function waitForNoConcurrentLaunchProof(ref) {
  const active = listInProgressLaunchProofRuns(ref);
  if (active.length === 0) return null;
  if (process.env.VIBE_LAUNCH_ALLOW_CONCURRENT === "1") {
    process.stdout.write(
      `Warning: ${active.length} launch-proof run(s) already active (allowed by VIBE_LAUNCH_ALLOW_CONCURRENT)
`,
    );
    return active[0]?.url ?? null;
  }
  const urls = active.map((r) => r.url).filter(Boolean);
  throw new Error(
    `launch-proof already in progress (${active.length} run(s)). ` +
      `Cancel duplicates in Actions or set VIBE_LAUNCH_ALLOW_CONCURRENT=1. ` +
      (urls[0] ? `Active: ${urls[0]}` : ""),
  );
}


function runReadiness() {
  execSync("npm run launch:readiness", {
    stdio: "inherit",
    env: process.env,
  });
}

function runOptionalTroubleshoot() {
  if (process.env.VIBE_LAUNCH_TROUBLESHOOT !== "1") {
    return { skipped: true };
  }

  const symptom =
    process.env.VIBE_LAUNCH_TROUBLESHOOT_SYMPTOM?.trim() ||
    "Vibe Promotion Gate preflight";

  process.stdout.write(`launch:ship troubleshoot preflight (${symptom})…\n`);
  try {
    execSync(`npm run orchestrate -- troubleshoot "${symptom}" --skip-llm`, {
      stdio: "inherit",
      env: { ...process.env, ORCHESTRATOR_SKIP_LLM: "1" },
    });
    return { ok: true, symptom };
  } catch {
    process.stderr.write(
      "Warning: launch troubleshoot preflight reported issues (fail-open; set VIBE_LAUNCH_TROUBLESHOOT=0 to skip).\n",
    );
    return { ok: false, symptom, failOpen: true };
  }
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
  let runId;
  const active = listInProgressLaunchProofRuns(ref);
  if (active.length > 0 && process.env.VIBE_LAUNCH_ALLOW_CONCURRENT !== "1") {
    runId = active[0].databaseId;
    process.stdout.write(
      `Attaching to in-progress launch-proof run ${runId} (${active[0].url ?? "no url"})…\n`,
    );
  } else {
    await waitForNoConcurrentLaunchProof(ref);
    ghText(`workflow run launch-proof.yml --ref ${ref}`);

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

const dryRun = process.argv.includes("--dry-run");

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
    state.troubleshoot = runOptionalTroubleshoot();
    runReadiness();
    state.readiness = { ok: true, at: new Date().toISOString() };

    if (dryRun) {
      try {
        state.pushCheck = assertGitPushOptional();
      } catch (e) {
        state.pushCheck = {
          ok: false,
          warning: e instanceof Error ? e.message : String(e),
        };
      }
      state.finishedAt = new Date().toISOString();
      state.ok = true;
      state.dryRun = true;
      writeState(state);
      process.stdout.write("launch:ship dry-run complete (readiness only)\n");
      return;
    }

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

    if (workflow.proof && !workflow.proof.receiptLink) {
      process.stdout.write(
        "Note: hosted receipt URL may 404 on a private repo until Pages is enabled — recorded in proof, not a ship blocker.\n",
      );
    }

    const bpStatus = bp.status ?? (bp.skipped ? "skipped_needs_admin" : bp.ok ? "enabled" : "failed");
    if (bpStatus === "skipped_private_free") {
      process.stderr.write(
        "Branch protection skipped (private free repo — API requires GitHub Pro). Use Settings → Branches in the UI.\n",
      );
    }
    state.ok = state.workflow.ok && bpStatus !== "failed";
    state.finishedAt = new Date().toISOString();
    writeState(state);

    if (bpStatus === "skipped_needs_admin" || bpStatus === "skipped_private_free") {
      process.stderr.write(
        "Branch protection skipped (needs admin PAT or UI). One-liner when you have admin scope:\n" +
          "  gh api -X PUT repos/$(gh repo view -q .nameWithOwner)/branches/main/protection --input scripts/.branch-protection-payload.json\n" +
          "Or: https://github.com/$(gh repo view -q .nameWithOwner)/settings/branches\n",
      );
    }

    process.stdout.write(`launch:ship complete (branchProtection=${bpStatus})\n`);
  } catch (error) {
    state.finishedAt = new Date().toISOString();
    state.error = error instanceof Error ? error.message : String(error);
    writeState(state);
    console.error(state.error);
    process.exit(1);
  }
}

main();
