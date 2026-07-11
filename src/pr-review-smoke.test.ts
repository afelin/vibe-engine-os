import { describe, expect, it } from "vitest";
import { prReviewSmokeStatus } from "./pr-review-smoke.js";

describe("pr review smoke", () => {
  it("exports the v1 status token", () => {
    expect(prReviewSmokeStatus).toBe("v1-pr-review-ok");
  });
});
