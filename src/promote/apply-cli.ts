import * as fs from "node:fs";
import { applyPromotionBundle } from "../run/promotion.js";
import { readRunManifest } from "../run/manifest.js";
import { sanitizeRunId } from "../run/paths.js";
import {
  buildPromotionSummary,
  createOrUpdateCheckRun,
  parseRepository,
} from "../publishing/github-checks.js";

const rootDir = process.argv[2] ?? ".";
const runIdArg = process.argv[3] ?? "";

if (!runIdArg) {
  console.error("Usage: promote:apply <root_dir> <run_id>");
  process.exit(1);
}

async function main() {
  const runId = sanitizeRunId(runIdArg);
  const { applied } = applyPromotionBundle(rootDir, runId);
  console.log(`Applied ${applied.length} file(s) from promotion bundle.`);

  const manifest = readRunManifest(rootDir, runId);
  if (!manifest) {
    console.error(`Manifest not found for run ${runId}`);
    process.exit(1);
  }

  await postPromotionCheck(rootDir, runId, manifest, applied.length > 0);
}

async function postPromotionCheck(
  rootDir: string,
  runId: string,
  manifest: NonNullable<ReturnType<typeof readRunManifest>>,
  success: boolean,
) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const headSha = process.env.GITHUB_SHA;

  if (!token || !repository || !headSha) return;

  const parsed = parseRepository(repository);
  if (!parsed) return;

  const summary = buildPromotionSummary({
    state: success ? "promoted" : "promotion_failed",
    vowsHash: manifest.vowsHash,
    capsuleHash: manifest.capsuleHash,
    firstPassGreen: manifest.metrics?.firstPassGreen,
    gateIdsFailed: manifest.metrics?.gateIdsFailed,
    runDir: `.runs/${runId}`,
  });

  const checkRunId = process.env.VIBE_CHECK_RUN_ID
    ? Number(process.env.VIBE_CHECK_RUN_ID)
    : undefined;

  const check = await createOrUpdateCheckRun({
    token,
    owner: parsed.owner,
    repo: parsed.repo,
    headSha,
    status: "completed",
    conclusion: success ? "success" : "failure",
    summary,
    checkRunId,
    externalId: runId,
    detailsUrl: process.env.GITHUB_SERVER_URL
      ? `${process.env.GITHUB_SERVER_URL}/${repository}/tree/main/.runs/${runId}`
      : undefined,
  });

  if (check) {
    console.log(`Promotion check run: ${check.html_url}`);
    const githubEnv = process.env.GITHUB_ENV;
    if (githubEnv) {
      fs.appendFileSync(githubEnv, `VIBE_CHECK_RUN_ID=${check.id}\n`, "utf8");
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Promotion apply failed:", message);
  process.exit(1);
});
