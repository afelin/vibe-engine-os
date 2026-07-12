import { sealTaskBond } from "./seal.js";
import { writeTaskBond } from "./store.js";
import { envelopeFromVerdict, formatSealVerdict } from "./verdict.js";
import { getVibeDepth } from "../os/depth.js";

const rootDir = process.argv[2] ?? ".";
const issueNumber = process.argv[3] ?? process.env.ISSUE_NUMBER ?? "";
const issueTitle = process.argv[4] ?? process.env.ISSUE_TITLE ?? "Vibe Request";
const issueBody = process.argv[5] ?? process.env.ISSUE_BODY ?? "";

if (!issueNumber) {
  console.error(
    "Usage: bond:seal <root_dir> <issue_number> [issue_title] [issue_body]",
  );
  console.error("Or set ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY env vars.");
  process.exit(1);
}

if (!issueBody.trim()) {
  console.error("Issue body required (4th arg or ISSUE_BODY env var).");
  process.exit(1);
}

const depth = getVibeDepth();
const result = sealTaskBond({
  issueNumber,
  issueTitle,
  issueBody,
  depth,
  rootDir,
});

if (!result.ok) {
  console.error(
    JSON.stringify(
      {
        valid: false,
        ...envelopeFromVerdict(formatSealVerdict(result)),
        errors: result.errors,
        evaluation: result.evaluation,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const bondPath = writeTaskBond(rootDir, result.bond);
console.log(`bondHash=${result.bond.bondHash}`);
console.log(`path=${bondPath}`);
console.log(JSON.stringify(result.bond, null, 2));
