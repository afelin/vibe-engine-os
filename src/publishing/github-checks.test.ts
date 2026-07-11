import { describe, expect, it } from "vitest";
import {
  buildPromotionSummary,
  parseRepository,
} from "./github-checks.js";

describe("github checks", () => {
  it("parses owner/repo from GITHUB_REPOSITORY", () => {
    expect(parseRepository("acme/vibe-engine-os")).toEqual({
      owner: "acme",
      repo: "vibe-engine-os",
    });
  });

  it("builds promotion summary with capsule and vows hash", () => {
    const summary = buildPromotionSummary({
      state: "completed",
      vowsHash: "vows123",
      capsuleHash: "capsule456",
      firstPassGreen: true,
      gateIdsFailed: [],
      runDir: ".runs/run-1",
    });
    expect(summary).toContain("Vibe Promotion Gate");
    expect(summary).toContain("vows123");
    expect(summary).toContain("capsule456");
    expect(summary).toContain("First-pass green");
  });
});
