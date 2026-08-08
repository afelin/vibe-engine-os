import { describe, expect, it } from "vitest";
import { parseOperatorCommand } from "./commands.js";
import { renderGoGuide } from "./cockpit.js";
import { routeGitHubComment } from "./github-comment-router.js";
import type { OSContext } from "../os/events.js";

const context: OSContext = {
  issueNumber: "42",
  issueTitle: "Ship /go",
  issueBody: "Operator guide",
  attempts: 1,
  maxAttempts: 3,
  risk: "medium",
  findings: [],
  generatedFiles: [],
  verificationResults: [],
  failures: [],
};

function numberedActions(body: string): string[] {
  const matches = [...body.matchAll(/^\d+\.\s/gm)];
  return matches.map((m) => m[0]);
}

describe("/go command", () => {
  it("parses /go", () => {
    expect(parseOperatorCommand("/go")).toEqual({ type: "go" });
    expect(parseOperatorCommand("  /go  extra")).toEqual({ type: "go" });
  });

  it("renders exactly 3 numbered actions for planning|awaiting_approval|completed|failed", () => {
    for (const state of [
      "planning",
      "awaiting_approval",
      "completed",
      "failed",
    ] as const) {
      const body = renderGoGuide({ state });
      expect(numberedActions(body)).toHaveLength(3);
      expect(body).toMatch(/1\.\s+\*\*Blocking:\*\*/);
      expect(body).toMatch(/2\.\s+\*\*Fastest unblock:\*\*/);
      expect(body).toMatch(/3\.\s+\*\*Merge or deploy next:\*\*/);
    }
  });

  it("awaiting_approval unblock points at /approve via resolveNextAction", () => {
    const body = renderGoGuide({ state: "awaiting_approval" });
    expect(body).toContain("/approve");
  });

  it("completed merge-or-deploy points at merge", () => {
    const body = renderGoGuide({ state: "completed" });
    expect(body.toLowerCase()).toContain("merge");
  });

  it("failed unblock points at /retry", () => {
    const body = renderGoGuide({ state: "failed" });
    expect(body).toContain("/retry");
  });

  it("pre-run onboarding returns exactly 3 actions", () => {
    const body = renderGoGuide({ preRun: true });
    expect(numberedActions(body)).toHaveLength(3);
    expect(body).toMatch(/1\.\s+\*\*Blocking:\*\*/);
    expect(body).toMatch(/2\.\s+\*\*Fastest unblock:\*\*/);
    expect(body).toMatch(/3\.\s+\*\*Merge or deploy next:\*\*/);
    expect(body.toLowerCase()).toMatch(
      /coreward request|vibe request|vibe\/run/,
    );
  });

  it("routes /go through the GitHub comment router to renderGoGuide", async () => {
    const result = await routeGitHubComment({
      body: "/go",
      actor: "alice",
      commentId: "comment-go-1",
      state: "awaiting_approval",
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });

    expect(result.handled).toBe(true);
    expect(result.event?.type).toBe("operator.status_requested");
    expect(result.responseBody).toMatch(/1\.\s+\*\*Blocking:\*\*/);
    expect(result.responseBody).toContain("/approve");
    expect(numberedActions(result.responseBody ?? "")).toHaveLength(3);
  });
});
