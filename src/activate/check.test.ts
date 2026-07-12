import { describe, expect, it } from "vitest";
import {
  checkNodeVersion,
  checkVowsPresent,
  runActivateChecks,
  smokeMcpHandlers,
} from "./check.js";
import { computeVowsHash } from "../constitution/vows.js";

describe("activate checks", () => {
  it("requires Node >= 22", () => {
    const node = checkNodeVersion();
    expect(node.version).toMatch(/^v\d+/);
    if (Number(node.version.replace(/^v/, "").split(".")[0]) >= 22) {
      expect(node.ok).toBe(true);
    }
  });

  it("finds vows.json in repo root", () => {
    expect(checkVowsPresent(".")).toBe(true);
  });

  it("runs activation checks with vows present", () => {
    const result = runActivateChecks(".");
    expect(result.vowsOk).toBe(true);
    expect(result.vowsHash).toBe(computeVowsHash("."));
    const nonNodeErrors = result.errors.filter(
      (error) => !error.includes("Node"),
    );
    expect(nonNodeErrors).toHaveLength(0);
  });

  it("smokes MCP handlers in-process", () => {
    const smoke = smokeMcpHandlers();
    expect(smoke.pass).toBe(true);
    expect(smoke.gateCount).toBeGreaterThanOrEqual(10);
  });
});
