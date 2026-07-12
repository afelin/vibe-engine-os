import { describe, expect, it } from "vitest";
import {
  listReleaseGateIds,
  loadReleaseGates,
  resolveGateFromRegistry,
  vitestSmokeTest,
} from "./registry.js";

describe("release gate registry", () => {
  it("loads the built-in smoke gates from gates.json", () => {
    const ids = listReleaseGateIds();
    expect(ids).toContain("cloud-loop-smoke");
    expect(ids).toContain("pr-review-smoke");
    expect(ids).toContain("add-unit-test");
    expect(loadReleaseGates().length).toBeGreaterThanOrEqual(10);
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
        "cloud loop",
        "src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts",
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
