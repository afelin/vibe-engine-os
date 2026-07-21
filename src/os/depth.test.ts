import { afterEach, describe, expect, it } from "vitest";
import {
  depthCapabilities,
  getVibeDepth,
  healMaxLevelForDepth,
  renderDepthStatus,
  resolveDepthFromLabels,
} from "./depth.js";

describe("vibe depth dial", () => {
  afterEach(() => {
    delete process.env.VIBE_DEPTH;
  });

  it("defaults to depth 3", () => {
    expect(getVibeDepth({})).toBe(3);
    expect(depthCapabilities(3).allowsTests).toBe(true);
    expect(depthCapabilities(3).allowsCodegen).toBe(true);
  });

  it("parses valid VIBE_DEPTH values", () => {
    expect(getVibeDepth({ VIBE_DEPTH: "0" })).toBe(0);
    expect(getVibeDepth({ VIBE_DEPTH: "5" })).toBe(5);
  });

  it("falls back to 3 for invalid values", () => {
    expect(getVibeDepth({ VIBE_DEPTH: "9" })).toBe(3);
    expect(getVibeDepth({ VIBE_DEPTH: "nope" })).toBe(3);
  });

  it("depth 0 is explain-only without writes", () => {
    const caps = depthCapabilities(0);
    expect(caps.allowsPlanWrite).toBe(false);
    expect(caps.allowsCodegen).toBe(false);
    expect(caps.allowsDiskWrite).toBe(false);
  });

  it("depth 1 is plan-only", () => {
    const caps = depthCapabilities(1);
    expect(caps.allowsPlanWrite).toBe(true);
    expect(caps.allowsCodegen).toBe(false);
  });

  it("depth 5 enforces protected approval", () => {
    expect(depthCapabilities(5).enforcesProtectedApproval).toBe(true);
    expect(depthCapabilities(3).enforcesProtectedApproval).toBe(false);
  });

  it("resolves depth from issue labels", () => {
    expect(resolveDepthFromLabels("vibe:plan-only,vibe/run")).toBe(1);
    expect(resolveDepthFromLabels("vibe:safe")).toBe(2);
    expect(resolveDepthFromLabels("vibe:ship")).toBe(4);
    expect(resolveDepthFromLabels("other")).toBeNull();
  });

  it("label depth overrides VIBE_DEPTH env", () => {
    expect(getVibeDepth({ VIBE_DEPTH: "3", VIBE_LABELS: "vibe:plan-only" })).toBe(1);
  });

  it("renders depth status for cockpit", () => {
    expect(renderDepthStatus(3)).toContain("Vibe Depth");
    expect(renderDepthStatus(3)).toContain("tests + implementation");
  });

  it("caps heal at L1 for depth 0–1 and allows L2+ at depth ≥ 2", () => {
    expect(healMaxLevelForDepth(0)).toBe(1);
    expect(healMaxLevelForDepth(1)).toBe(1);
    expect(healMaxLevelForDepth(2)).toBe(3);
    expect(healMaxLevelForDepth(5)).toBe(3);
  });
});
