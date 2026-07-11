import { callReleaseGateTool } from "./mcp-handlers.js";
import { sanitizeRunId } from "../run/paths.js";

const rootDir = process.argv[2] ?? ".";
const runIdArg = process.argv[3] ?? "";

if (!runIdArg) {
  console.error("Usage: validate-capsule-cli <root_dir> <run_id>");
  process.exit(1);
}

let runId: string;
try {
  runId = sanitizeRunId(runIdArg);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "Invalid run_id";
  console.error(message);
  process.exit(1);
}

const text = callReleaseGateTool("validate_capsule", {
  root_dir: rootDir,
  run_id: runId,
});
const parsed = JSON.parse(text) as {
  valid: boolean;
  vowsCompliant?: boolean;
  capsuleHash?: string;
  vowsHash?: string;
  manifestError?: string | null;
};

if (!parsed.valid) {
  console.error(JSON.stringify(parsed, null, 2));
  process.exit(1);
}

console.log(`capsuleHash=${parsed.capsuleHash ?? ""}`);
console.log(`vowsHash=${parsed.vowsHash ?? ""}`);
console.log(`vowsCompliant=${parsed.vowsCompliant === true}`);
