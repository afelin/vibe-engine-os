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
    const result = routeGitHubComment({
      body: "/approve",
      actor: "alice",
      commentId: "comment-1",
      state: "awaiting_approval",
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });

    expect(result.event).toEqual({
      type: "approval.granted",
      actor: "alice",
      commentId: "comment-1",
    });
    expect(result.responseBody).toContain("Approval received");
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
    expect(result.responseBody).toContain("Vibe Engine OS Cockpit");
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
});
