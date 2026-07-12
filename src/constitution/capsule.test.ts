import { describe, expect, it } from "vitest";
import { computeCapsuleHash } from "./capsule.js";
import type { RunManifest } from "../run/manifest.js";

describe("capsule hash", () => {
  const manifest: RunManifest = {
    runId: "run-1",
    issueNumber: "1",
    issueTitle: "Test",
    branchName: "main",
    baseSha: "abc",
    generatedFiles: ["src/a.ts"],
    createdAt: "2026-07-04T00:00:00.000Z",
    vowsHash: "vows-hash",
    metrics: {
      attempts: 1,
      firstPassGreen: true,
      gateIdsFailed: [],
      durationMs: 10,
    },
  };

  it("produces stable sha256 capsule hash", () => {
    const hash1 = computeCapsuleHash({
      manifest,
      snapshot: { value: "completed" },
      traceTail: ["line1"],
    });
    const hash2 = computeCapsuleHash({
      manifest,
      snapshot: { value: "completed" },
      traceTail: ["line1"],
    });
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes hash when snapshot changes", () => {
    const a = computeCapsuleHash({ manifest, snapshot: { value: "a" } });
    const b = computeCapsuleHash({ manifest, snapshot: { value: "b" } });
    expect(a).not.toBe(b);
  });
});
