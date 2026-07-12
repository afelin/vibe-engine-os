import { describe, expect, it } from "vitest";
import { resolveRunDir, sanitizeRunId } from "./paths.js";

describe("run paths", () => {
  it("accepts valid run ids", () => {
    expect(sanitizeRunId("issue-1-2026-07-04T00-00-00-000Z")).toBe(
      "issue-1-2026-07-04T00-00-00-000Z",
    );
  });

  it("rejects traversal and separators", () => {
    expect(() => sanitizeRunId("../escape")).toThrow(/Invalid runId/);
    expect(() => sanitizeRunId("a/b")).toThrow(/Invalid runId/);
    expect(() => sanitizeRunId("a\\b")).toThrow(/Invalid runId/);
    expect(() => sanitizeRunId("")).toThrow(/Invalid runId/);
  });

  it("resolves run dir inside .runs container", () => {
    const dir = resolveRunDir("/tmp/repo", "run-001");
    expect(dir).toBe("/tmp/repo/.runs/run-001");
  });

  it("throws when run dir would escape container", () => {
    expect(() => resolveRunDir("/tmp/repo", "..")).toThrow(/Invalid runId/);
  });
});
