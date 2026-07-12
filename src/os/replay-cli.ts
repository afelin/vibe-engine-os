#!/usr/bin/env tsx
import { sanitizeRunId } from "../run/paths.js";
import { replayRun } from "./replay.js";

const rootDir = process.argv[2] ?? ".";
const runIdArg = process.argv[3] ?? "";

if (!runIdArg) {
  console.error("Usage: replay-cli <root_dir> <run_id>");
  process.exit(1);
}

let runId: string;
try {
  runId = sanitizeRunId(runIdArg);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "Invalid run_id");
  process.exit(1);
}

const result = replayRun(rootDir, runId);
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exit(1);
}
