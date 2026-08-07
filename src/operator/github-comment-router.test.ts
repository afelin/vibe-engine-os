import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { routeGitHubComment } from "./github-comment-router.js";
import type { OSContext } from "../os/events.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
  it("routes /approve into an approval event and acknowledgement", async () => {
    const previous = process.env.GITHUB_ACTIONS;
    const previousApprovers = process.env.VIBE_APPROVERS;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.VIBE_APPROVERS;

    try {
      const result = await routeGitHubComment({
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

  it("denies /approve from actors outside the allowlist in CI", async () => {
    const previous = process.env.GITHUB_ACTIONS;
    const previousApprovers = process.env.VIBE_APPROVERS;
    process.env.GITHUB_ACTIONS = "true";
    process.env.VIBE_APPROVERS = "trusted-operator";

    try {
      const result = await routeGitHubComment({
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

  it("routes /status to a cockpit projection", async () => {
    const result = await routeGitHubComment({
      body: "/status",
      actor: "alice",
      commentId: "comment-2",
      state: "learning",
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });

    expect(result.event?.type).toBe("operator.status_requested");
    expect(result.responseBody).toContain("## Coreward");
    expect(result.responseBody).toContain("learning");
  });

  it("routes /rollback to read-only rollback instructions", async () => {
    const result = await routeGitHubComment({
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

  it("ignores unknown comments", async () => {
    const result = await routeGitHubComment({
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

  it("nudges Vibe Request when comment looks like ship work", async () => {
    const result = await routeGitHubComment({
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

  it("wires /troubleshoot through runTroubleshootDag cockpit", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-gh-ts-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });

    const result = await routeGitHubComment({
      body: "/troubleshoot Vibe Promotion Gate failing",
      actor: "alice",
      commentId: "comment-ts",
      state: "learning",
      rootDir: root,
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });

    expect(result.handled).toBe(true);
    expect(result.event?.type).toBe("operator.troubleshoot_requested");
    expect(result.responseBody).toContain("## Troubleshoot result");
    expect(result.responseBody).not.toContain(
      "Routing through the orchestrator DAG",
    );
    expect(result.responseBody).toMatch(/guidance_delivered|Healed:\s*yes/i);
  });

  it("ignores duplicate command comment ids (idempotent webhook replay)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-gh-dup-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });

    const first = await routeGitHubComment({
      body: "/status",
      actor: "alice",
      commentId: "comment-dup-1",
      state: "learning",
      rootDir: root,
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });
    expect(first.handled).toBe(true);
    expect(first.event?.type).toBe("operator.status_requested");

    const second = await routeGitHubComment({
      body: "/status",
      actor: "alice",
      commentId: "comment-dup-1",
      state: "learning",
      rootDir: root,
      context,
      readRollback: () => ({ found: false, body: "missing" }),
    });
    expect(second.handled).toBe(true);
    expect(second.event).toBeNull();
    expect(second.responseBody).toContain("Duplicate command ignored");
  });
});
