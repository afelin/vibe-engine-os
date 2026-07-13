import {
  buildPromotionSummary,
  createOrUpdateCheckRun,
  parseRepository,
} from "../publishing/github-checks.js";

function parseConclusion(argv: string[]): "success" | "failure" {
  const flagIndex = argv.indexOf("--conclusion");
  if (flagIndex >= 0 && argv[flagIndex + 1] === "failure") return "failure";
  return "success";
}

async function main() {
  const conclusion = parseConclusion(process.argv);
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const headSha = process.env.VIBE_HEAD_SHA ?? process.env.GITHUB_SHA;
  const pullNumber = process.env.VIBE_PR_NUMBER;

  if (!token || !repository || !headSha) {
    console.error("Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or head SHA");
    process.exit(1);
  }

  const parsed = parseRepository(repository);
  if (!parsed) {
    console.error("Invalid GITHUB_REPOSITORY");
    process.exit(1);
  }

  const success = conclusion === "success";
  const summary = buildPromotionSummary({
    state: success ? "pr_check_green" : "pr_check_failed",
    runDir: pullNumber ? `PR #${pullNumber}` : undefined,
  });

  const check = await createOrUpdateCheckRun({
    token,
    owner: parsed.owner,
    repo: parsed.repo,
    headSha,
    status: "completed",
    conclusion,
    summary,
    externalId: pullNumber ? `pr-${pullNumber}` : `pr-gate-${headSha.slice(0, 12)}`,
    detailsUrl:
      process.env.GITHUB_SERVER_URL && pullNumber
        ? `${process.env.GITHUB_SERVER_URL}/${repository}/pull/${pullNumber}`
        : undefined,
  });

  if (!check) {
    console.error("Failed to create Vibe Promotion Gate check run");
    process.exit(1);
  }

  console.log(`Vibe Promotion Gate check: ${check.html_url}`);
  if (!success) process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Post PR gate failed:", message);
  process.exit(1);
});
