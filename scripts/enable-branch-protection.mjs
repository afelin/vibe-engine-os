#!/usr/bin/env node
/**
 * Enable required status checks on main. Needs admin repo scope (often a PAT).
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REQUIRED_CHECKS = [
  "Vibe Promotion Gate",
  "Audit Assisted-by attribution",
];

function ghJson(args) {
  const output = execSync(`gh ${args}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  }).trim();
  return output ? JSON.parse(output) : null;
}

function printUiFallback(repo) {
  process.stderr.write(`
Branch protection could not be applied via API (missing admin scope or SSO).

Do this in the GitHub UI:
1. Open https://github.com/${repo}/settings/branches
2. Add or edit a rule for branch \`main\`
3. Enable "Require status checks to pass before merging"
4. Search and select:
   - Vibe Promotion Gate
   - Audit Assisted-by attribution
   (If a check is missing, merge one PR that ran CI first.)
5. Save changes

For automation, set a PAT with \`repo\` + admin on the repo and export GH_TOKEN before \`npm run launch:ship\`.
`);
}

export function enableBranchProtection() {
  const repo = execSync("gh repo view --json nameWithOwner -q .nameWithOwner", {
    encoding: "utf8",
    env: process.env,
  }).trim();

  const payload = {
    required_status_checks: {
      strict: true,
      checks: REQUIRED_CHECKS.map((context) => ({ context })),
    },
    enforce_admins: false,
    required_pull_request_reviews: null,
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: false,
  };

  try {
    execSync(
      `gh api -X PUT repos/${repo}/branches/main/protection --input -`,
      {
        input: JSON.stringify(payload),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      },
    );
    return { ok: true, repo, checks: REQUIRED_CHECKS };
  } catch (error) {
    printUiFallback(repo);
    const message =
      error instanceof Error ? error.message : String(error);
    return { ok: false, repo, checks: REQUIRED_CHECKS, error: message };
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const result = enableBranchProtection();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
