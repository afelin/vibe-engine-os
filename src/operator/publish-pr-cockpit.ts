import { readRunManifest } from "../run/manifest.js";
import { sanitizeRunId } from "../run/paths.js";
import {
  publishCockpitComment,
  resolveGitHubCommentTarget,
} from "../publishing/github-comments.js";
import { renderCockpitComment, resolvePrUrl } from "./cockpit.js";

const rootDir = process.argv[2] ?? ".";
const runIdArg = process.argv[3] ?? process.env.RUN_ID ?? "";

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

  const body = renderCockpitComment(
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
