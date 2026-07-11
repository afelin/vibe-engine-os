import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendTraceSpan,
  formatFailureRecall,
  readRecentFailuresByPathPrefix,
  readTraceSpans,
} from "./trace.js";

describe("run trace jsonl", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("appends and reads trace spans", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-trace-"));
    tmpDirs.push(root);
    const runId = "run-trace-1";

    appendTraceSpan(root, runId, { phase: "preflight" });
    appendTraceSpan(root, runId, {
      phase: "validator",
      passed: false,
      gate_id: "protected_files",
      path: "src/auth/session.ts",
      detail: "forbidden",
    });

    const spans = readTraceSpans(root, runId);
    expect(spans).toHaveLength(2);
    expect(spans[1]).toMatchObject({
      phase: "validator",
      passed: false,
      gate_id: "protected_files",
      path: "src/auth/session.ts",
    });
  });

  it("recalls recent failures by path prefix", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-recall-"));
    tmpDirs.push(root);

    appendTraceSpan(root, "run-old", {
      phase: "validator",
      passed: false,
      gate_id: "vitest",
      path: "src/example.ts",
      detail: "test failed",
    });
    appendTraceSpan(root, "run-new", {
      phase: "validator",
      passed: false,
      gate_id: "typescript_compiler",
      path: "src/example.ts",
      detail: "compile failed",
    });
    appendTraceSpan(root, "run-other", {
      phase: "validator",
      passed: false,
      gate_id: "vitest",
      path: "src/other.ts",
      detail: "other failed",
    });

    const recalled = readRecentFailuresByPathPrefix(root, "src/example", 3);
    expect(recalled).toHaveLength(2);
    expect(recalled.every((span) => span.path?.startsWith("src/example"))).toBe(
      true,
    );
  });

  it("formats failure recall for planner prompts", () => {
    const text = formatFailureRecall([
      {
        phase: "validator",
        ts: "2026-07-04T00:00:00.000Z",
        runId: "run-1",
        passed: false,
        gate_id: "vitest",
        path: "src/example.ts",
        detail: "assertion failed",
      },
    ]);

    expect(text).toContain("vitest");
    expect(text).toContain("src/example.ts");
    expect(text).toContain("assertion failed");
  });
});
