import { describe, expect, it } from "vitest";
import { detectShipWork, extractSrcPaths } from "./ship-heuristic.js";

describe("ship heuristic", () => {
  it("extracts unique src paths", () => {
    expect(
      extractSrcPaths("touch src/a.ts and src/b.ts plus src/a.ts again"),
    ).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("detects ship work with two src paths and an action verb", () => {
    const result = detectShipWork({
      body: "Please add tests in src/foo.ts and implement src/bar.ts",
      repository: "afelin/vibe-engine-os",
    });

    expect(result.looksLikeShipWork).toBe(true);
    expect(result.srcPaths).toEqual(["src/bar.ts", "src/foo.ts"]);
    expect(result.nudge).toContain("Vibe Request");
    expect(result.nudge).toContain("vibe-request.yml");
  });

  it("ignores when vibe/run label is present", () => {
    const result = detectShipWork({
      body: "fix src/a.ts and src/b.ts",
      labels: "vibe/run,vibe:safe",
    });

    expect(result.looksLikeShipWork).toBe(false);
    expect(result.nudge).toBeNull();
  });

  it("ignores plan-only issues", () => {
    const result = detectShipWork({
      body: "update src/a.ts and src/b.ts",
      labels: "vibe:plan-only",
    });

    expect(result.looksLikeShipWork).toBe(false);
  });

  it("ignores single-path mentions", () => {
    const result = detectShipWork({
      body: "fix src/only.ts please",
    });

    expect(result.looksLikeShipWork).toBe(false);
  });

  it("ignores when a bond already exists", () => {
    const result = detectShipWork({
      body: "ship src/a.ts and src/b.ts",
      hasBond: true,
    });

    expect(result.looksLikeShipWork).toBe(false);
  });
});
