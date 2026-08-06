import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkGauntletBaseline,
  checkMcpSmoke,
  checkRequiredWorkflows,
  checkStartHereDoc,
  checkVibeStarterTemplate,
  runLaunchReadiness,
} from "./readiness.js";

describe("launch readiness", () => {
  it("passes all checks on the engine repo", () => {
    const result = runLaunchReadiness(".");
    for (const check of result.checks.filter((item) => !item.ok)) {
      console.error(`${check.id}: ${check.detail}`);
    }
    expect(result.ok).toBe(true);
    expect(result.checks.length).toBeGreaterThanOrEqual(10);
  });

  it("requires docs/start-here.md and vibe-starter.yml", () => {
    expect(checkStartHereDoc(".").ok).toBe(true);
    expect(checkVibeStarterTemplate(".").ok).toBe(true);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-readiness-entry-"));
    try {
      expect(checkStartHereDoc(tmp).ok).toBe(false);
      expect(checkVibeStarterTemplate(tmp).ok).toBe(false);
      const result = runLaunchReadiness(tmp);
      expect(
        result.checks.some(
          (check) => check.id === "file:docs/start-here.md" && !check.ok,
        ),
      ).toBe(true);
      expect(
        result.checks.some(
          (check) =>
            check.id === "file:.github/ISSUE_TEMPLATE/vibe-starter.yml" &&
            !check.ok,
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("finds required workflows", () => {
    const checks = checkRequiredWorkflows(".");
    expect(checks.every((check) => check.ok)).toBe(true);
    expect(checks).toHaveLength(4);
  });

  it("smokes MCP handlers in-process", () => {
    expect(checkMcpSmoke().ok).toBe(true);
  });

  it("validates gauntlet baseline", () => {
    const check = checkGauntletBaseline(".");
    expect(check.ok).toBe(true);
    expect(check.detail).toContain("green");
  });

  it("fails when workflows are missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-readiness-"));
    try {
      const result = runLaunchReadiness(tmp);
      expect(result.ok).toBe(false);
      expect(result.checks.some((check) => check.id.includes("forever.yml"))).toBe(
        true,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
