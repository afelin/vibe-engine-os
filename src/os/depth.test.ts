import { afterEach, describe, expect, it } from "vitest";
import {
  depthCapabilities,
  getVibeDepth,
  renderDepthStatus,
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

  it("renders depth status for cockpit", () => {
    expect(renderDepthStatus(3)).toContain("Vibe Depth");
    expect(renderDepthStatus(3)).toContain("tests + implementation");
  });
});
