import { afterEach, describe, expect, it, vi } from "vitest";
import { isApproverAllowed } from "./approvers.js";

describe("approver allowlist", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("allows listed mandate operators", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.stubEnv("VIBE_APPROVERS", "alice,bob");
    expect(isApproverAllowed("alice")).toBe(true);
    expect(isApproverAllowed("carol")).toBe(false);
  });

  it("allows wildcard in dev approvers", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.stubEnv("VIBE_APPROVERS", "*");
    expect(isApproverAllowed("anyone")).toBe(true);
  });

  it("fails closed in CI when no approvers configured", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    delete process.env.VIBE_APPROVERS;
    expect(isApproverAllowed("alice")).toBe(false);
  });

  it("allows mandate operators locally and in CI", () => {
    delete process.env.GITHUB_ACTIONS;
    delete process.env.VIBE_APPROVERS;
    expect(isApproverAllowed("afelin")).toBe(true);
    expect(isApproverAllowed("alice")).toBe(false);
  });
});
