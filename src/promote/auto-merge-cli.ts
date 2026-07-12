#!/usr/bin/env tsx
import { attemptAutoMerge } from "./auto-merge.js";

function parseArgs(argv: string[]) {
  const out: {
    pullNumber?: number;
    headSha?: string;
    dryRun: boolean;
  } = { dryRun: false };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--sha") out.headSha = argv[++i];
    else if (/^\d+$/.test(arg)) out.pullNumber = Number(arg);
  }

  return out;
}

const args = parseArgs(process.argv);
const verdict = await attemptAutoMerge({
  pullNumber: args.pullNumber,
  headSha: args.headSha,
  dryRun: args.dryRun,
});

console.log(JSON.stringify(verdict, null, 2));

const waitReasons = new Set([
  "missing_auto_merge_label",
  "mergeable_state_blocked",
  "mergeable_state_dirty",
  "mergeable_state_unstable",
  "mergeable_state_unknown",
  "promotion_gate_not_green",
  "not_mergeable",
  "no_open_pr_for_sha",
]);

if (!verdict.ok && !waitReasons.has(verdict.reason)) {
  process.exit(1);
}
