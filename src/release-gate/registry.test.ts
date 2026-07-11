import { describe, expect, it } from "vitest";
import {
  listReleaseGateIds,
  loadReleaseGates,
  resolveGateFromRegistry,
  vitestSmokeTest,
} from "./registry.js";

describe("release gate registry", () => {
  it("loads the built-in smoke gates from gates.json", () => {
    expect(listReleaseGateIds()).toEqual([
      "cloud-loop-smoke",
      "pr-review-smoke",
    ]);
    expect(loadReleaseGates()).toHaveLength(2);
  });

  it("expands smokeTest file specs into vitest modules", () => {
    const content = vitestSmokeTest(
      "cloud-loop-smoke",
      "cloudLoopSmokeStatus",
      "v1-cloud-loop-ok",
    );

    expect(content).toContain('from "./cloud-loop-smoke.js"');
    expect(content).toContain('"v1-cloud-loop-ok"');
  });

  it("matches gates using registry rules", () => {
    expect(
      resolveGateFromRegistry(
        "Release gate: V1 cloud loop smoke primitive",
        "Create src/cloud-loop-smoke.ts and src/cloud-loop-smoke.test.ts",
      )?.id,
    ).toBe("cloud-loop-smoke");

    expect(
      resolveGateFromRegistry(
        "Release gate: PR review workflow smoke trigger (PR Feedback)",
        "",
      )?.id,
    ).toBe("pr-review-smoke");
  });
});
