import * as path from "node:path";

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function sanitizeRunId(runId: string): string {
  const trimmed = runId.trim();
  if (
    !trimmed ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    throw new Error(`Invalid runId: ${runId}`);
  }
  if (!RUN_ID_PATTERN.test(trimmed)) {
    throw new Error(`Invalid runId format: ${runId}`);
  }
  return trimmed;
}

export function resolveRunDir(rootDir: string, runId: string): string {
  const safe = sanitizeRunId(runId);
  const container = path.resolve(rootDir, ".runs");
  const runDir = path.resolve(container, safe);
  if (runDir !== container && !runDir.startsWith(`${container}${path.sep}`)) {
    throw new Error(`Run directory escapes container: ${runId}`);
  }
  return runDir;
}
