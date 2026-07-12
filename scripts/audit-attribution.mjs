#!/usr/bin/env node
/**
 * Assisted-by attribution audit (fail-open on git errors).
 *
 * Scans commit messages in `git log <base>..HEAD`. Commits whose message
 * mentions AI tooling (cursor|claude|gpt|copilot|gemini|groq) must carry an
 * `Assisted-by:` trailer (a `Co-authored-by:` trailer naming the AI tool also
 * counts). Exits 1 listing offenders, 0 otherwise.
 *
 * Usage: node scripts/audit-attribution.mjs [base-ref]
 * Base ref resolution: argv[2] > $BASE_REF > origin/main
 */
import { execSync } from "node:child_process";

const AI_TOOL_PATTERN = /cursor|claude|gpt|copilot|gemini|groq/i;
const ATTRIBUTION_PATTERN =
  /assisted-by:|co-authored-by:.*(cursor|claude|gpt|copilot|gemini|groq)/i;
const COMMIT_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u001f";

const base = process.argv[2] || process.env.BASE_REF || "origin/main";

let raw;
try {
  raw = execSync(
    `git log --format=%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%B${COMMIT_SEPARATOR} ${base}..HEAD`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (error) {
  console.warn(
    `attribution-audit: warning — git log failed (${error.message?.split("\n")[0] ?? error}); skipping audit (fail open)`,
  );
  process.exit(0);
}

const offenders = raw
  .split(COMMIT_SEPARATOR)
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const [sha, subject, body] = chunk.split(FIELD_SEPARATOR);
    return { sha, subject, body: body ?? "" };
  })
  .filter(
    ({ body }) => AI_TOOL_PATTERN.test(body) && !ATTRIBUTION_PATTERN.test(body),
  );

if (offenders.length === 0) {
  console.log(`attribution-audit: ok — ${base}..HEAD clean`);
  process.exit(0);
}

console.error(
  `attribution-audit: FAIL — ${offenders.length} commit(s) mention AI tooling without an Assisted-by: tag:\n`,
);
for (const { sha, subject } of offenders) {
  console.error(`  ${sha.slice(0, 12)}  ${subject}`);
}
console.error(`
Remediation: add an Assisted-by: trailer to each offending commit message, e.g.

  git commit --amend --no-edit --trailer "Assisted-by: Cursor"

or for older commits, rebase and reword:

  git rebase -i ${base}   # mark offenders as "reword", append the trailer

Then force-push the branch.`);
process.exit(1);
