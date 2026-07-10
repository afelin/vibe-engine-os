import { describe, expect, it } from "vitest";
import { cloudLoopSmokeStatus } from "./cloud-loop-smoke.js";

describe("cloud loop smoke", () => {
  it("exports the v1 status token", () => {
    expect(cloudLoopSmokeStatus).toBe("v1-cloud-loop-ok");
  });
});
