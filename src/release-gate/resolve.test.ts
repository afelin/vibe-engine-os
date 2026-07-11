import { describe, expect, it } from "vitest";
import { resolveReleaseGatePatch } from "./resolve.js";

describe("resolveReleaseGatePatch", () => {
  it("matches the issue #3 cloud-loop smoke spec by required paths", () => {
    const match = resolveReleaseGatePatch(
      "Release gate: V1 cloud loop smoke primitive",
      "Create src/cloud-loop-smoke.ts and src/cloud-loop-smoke.test.ts",
    );

    expect(match?.id).toBe("cloud-loop-smoke");
    expect(match?.files.map((file) => file.path)).toEqual([
      "src/cloud-loop-smoke.ts",
      "src/cloud-loop-smoke.test.ts",
    ]);
  });

  it("matches the PR review gate from pull_request_review title routing", () => {
    const match = resolveReleaseGatePatch(
      "Release gate: PR review workflow smoke trigger (PR Feedback)",
      "",
    );

    expect(match?.id).toBe("pr-review-smoke");
    expect(match?.files.map((file) => file.path)).toEqual([
      "src/pr-review-smoke.ts",
      "src/pr-review-smoke.test.ts",
    ]);
  });

  it("matches the PR review gate when review body names required outputs", () => {
    const match = resolveReleaseGatePatch(
      "Some PR (PR Feedback)",
      "Ship src/pr-review-smoke.ts and src/pr-review-smoke.test.ts",
    );

    expect(match?.id).toBe("pr-review-smoke");
  });

  it("returns null for unrelated requests", () => {
    expect(
      resolveReleaseGatePatch("Add dark mode", "Please add a theme toggle"),
    ).toBeNull();
  });
});
