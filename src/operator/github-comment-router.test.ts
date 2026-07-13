import { describe, expect, it } from "vitest";
import { routeGitHubComment } from "./github-comment-router.js";
import type { OSContext } from "../os/events.js";

const context: OSContext = {
  issueNumber: "9",
  issueTitle: "Improve operator flow",
  issueBody: "Route comments",
  attempts: 1,
  maxAttempts: 3,
  risk: "high",
  riskReason: "Protected file",
  findings: [],
  generatedFiles: [],
  verificationResults: [],
  failures: [],
};

describe("GitHub comment router", () => {
  it("routes /approve into an approval event and acknowledgement", () => {
    const previous = process.env.GITHUB_ACTIONS;
    const previousApprovers = process.env.VIBE_APPROVERS;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.VIBE_APPROVERS;

    try {
      const result = routeGitHubComment({
        body: "/approve",
        actor: "afelin",
        commentId: "comment-1",
        state: "awaiting_approval",
        rootDir: ".",
        context,
        readRollback: () => ({ found: false, body: "missing" }),
      });

      expect(result.event).toEqual({
        type: "approval.granted",
        actor: "afelin",
        commentId: "comment-1",
      });
      expect(result.responseBody).toContain("Resuming the paused run");
    } finally {
      if (previous === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = previous;
      if (previousApprovers === undefined) delete process.env.VIBE_APPROVERS;
      else process.env.VIBE_APPROVERS = previousApprovers;
    }
  });

  it("denies /approve from actors outside the allowlist in CI", () => {
    const previous = process.env.GITHUB_ACTIONS;
    const previousApprovers = process.env.VIBE_APPROVERS;
    process.env.GITHUB_ACTIONS = "true";
    process.env.VIBE_APPROVERS = "trusted-operator";

    try {
      const result = routeGitHubComment({
        body: "/approve",
        actor: "alice",
        commentId: "comment-deny",
        state: "awaiting_approval",
        rootDir: ".",
        context,
        readRollback: () => ({ found: false, body: "missing" }),
      });

      expect(result.handled).toBe(true);
      expect(result.event).toBeNull();
      expect(result.responseBody).toContain("Approval denied");
    } finally {
      if (previous === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = previous;
      if (previousApprovers === undefined) delete process.env.VIBE_APPROVERS;
      else process.env.VIBE_APPROVERS = previousApprovers;
    }
  });

  it("routes /status to a cockpit projection", () => {
    const result = routeGitHubComment({
      body: "/status",
      actor: "alice",
      commentId: "comment-2",
      state: "learning",
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });

    expect(result.event?.type).toBe("operator.status_requested");
    expect(result.responseBody).toContain("## Vibe Engine OS");
    expect(result.responseBody).toContain("learning");
  });

  it("routes /rollback to read-only rollback instructions", () => {
    const result = routeGitHubComment({
      body: "/rollback",
      actor: "alice",
      commentId: "comment-3",
      state: "learning",
      context,
      readRollback: () => ({
        found: true,
        runId: "run-1",
        body: "# Rollback run-1\n",
      }),
    });

    expect(result.event?.type).toBe("operator.rollback_requested");
    expect(result.responseBody).toContain("# Rollback run-1");
    expect(result.responseBody).not.toContain("git reset");
  });

  it("ignores unknown comments", () => {
    const result = routeGitHubComment({
      body: "looks good",
      actor: "alice",
      commentId: "comment-4",
      state: "learning",
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });

    expect(result).toEqual({
      handled: false,
      event: null,
      responseBody: null,
    });
  });

  it("nudges Vibe Request when comment looks like ship work", () => {
    const result = routeGitHubComment({
      body: "Please implement src/foo.ts and add tests in src/foo.test.ts",
      actor: "alice",
      commentId: "comment-ship",
      state: "learning",
      repository: "afelin/vibe-engine-os",
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });

    expect(result.handled).toBe(true);
    expect(result.event).toBeNull();
    expect(result.responseBody).toContain("This looks like ship work");
    expect(result.responseBody).toContain("vibe-request.yml");
  });
});
