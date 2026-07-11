import * as fs from "node:fs";
import * as path from "node:path";

export type TraceSpan = {
  phase: string;
  ts: string;
  runId: string;
  passed?: boolean;
  gate_id?: string;
  path?: string;
  detail?: string;
  tokensEstimate?: number;
  durationMs?: number;
};

export function appendTraceSpan(
  rootDir: string,
  runId: string,
  span: Omit<TraceSpan, "ts" | "runId">,
): void {
  const dir = path.join(rootDir, ".runs", runId);
  fs.mkdirSync(dir, { recursive: true });
  const line: TraceSpan = {
    ...span,
    runId,
    ts: new Date().toISOString(),
  };
  fs.appendFileSync(
    path.join(dir, "trace.ndjson"),
    `${JSON.stringify(line)}\n`,
    "utf8",
  );
}

export function readTraceSpans(rootDir: string, runId: string): TraceSpan[] {
  const tracePath = path.join(rootDir, ".runs", runId, "trace.ndjson");
  if (!fs.existsSync(tracePath)) return [];

  return fs
    .readFileSync(tracePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TraceSpan);
}

export function readRecentFailuresByPathPrefix(
  rootDir: string,
  pathPrefix: string,
  limit = 3,
): TraceSpan[] {
  const runsDir = path.join(rootDir, ".runs");
  if (!fs.existsSync(runsDir)) return [];

  const failures: TraceSpan[] = [];
  const runDirs = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const runId of runDirs) {
    const spans = readTraceSpans(rootDir, runId);
    for (const span of spans.reverse()) {
      if (span.passed === false && span.path?.startsWith(pathPrefix)) {
        failures.push(span);
        if (failures.length >= limit) return failures;
      }
    }
  }

  return failures;
}

export function formatFailureRecall(spans: TraceSpan[]): string {
  if (spans.length === 0) return "";
  return spans
    .map(
      (span) =>
        `- [${span.gate_id ?? span.phase}] ${span.path ?? "unknown"}: ${span.detail ?? "failed"}`,
    )
    .join("\n");
}
