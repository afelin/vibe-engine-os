import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("agent entrypoint hardening", () => {
  it("exits non-zero when the top-level OS run rejects", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toMatch(/runOS\(\)\.catch\([\s\S]*process\.exit\(1\)/);
  });

  it("delegates runtime authority to the XState runner", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("./src/os/run.js");
    expect(agentSource).toContain("runOSActor");
  });

  it("records a run manifest and rollback instructions for generated files", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("./src/run/manifest.js");
    expect(agentSource).toContain("writeRunManifest");
    expect(agentSource).toContain("renderRollbackInstructions");
  });

  it("falls back to agent.md when AGENTS.md is not present", () => {
    const runSource = fs.readFileSync(
      path.join(process.cwd(), "src/os/run.ts"),
      "utf8",
    );

    expect(runSource).toContain('"AGENTS.md"');
    expect(runSource).toContain('"agent.md"');
    expect(runSource).toContain("readConstitution");
  });

  it("validates generated patches before writing them to disk", () => {
    const runSource = fs.readFileSync(
      path.join(process.cwd(), "src/os/run.ts"),
      "utf8",
    );
    const validatorIndex = runSource.indexOf("runGeneratedPatchValidators");
    const writeIndex = runSource.indexOf("writeFilesToDisk");

    expect(validatorIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(-1);
    expect(validatorIndex).toBeLessThan(writeIndex);
    expect(runSource).toContain("Ax boundary");
  });

  it("publishes passive cockpit comments for terminal run states", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("publishCockpitFromEnv");
    expect(agentSource).toContain('publishCockpitFromEnv("failed"');
    expect(agentSource).toContain('publishCockpitFromEnv("completed"');
    expect(agentSource).toContain("renderCockpitComment");
    expect(agentSource).toContain("publishCockpitComment");
  });

  it("resolves release-gate smoke specs before model inference starts", () => {
    const runSource = fs.readFileSync(
      path.join(process.cwd(), "src/os/run.ts"),
      "utf8",
    );

    expect(runSource).toContain("resolveReleaseGatePatch");
    expect(runSource).toContain("runGeneratedPatchValidators");
  });

  it("routes operator comments before model inference starts", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("./src/operator/github-comment-router.js");
    expect(agentSource).toContain("./src/os/event-ledger.js");
    expect(agentSource).toContain("./src/run/rollback.js");
    expect(agentSource).toContain("appendOperatorEvent");
    expect(agentSource).toContain("markOperatorOnlyFromEnv");
    expect(agentSource).toContain("readLatestRollbackInstructions");
    const runBlock = agentSource.slice(
      agentSource.indexOf("async function runOS"),
      agentSource.indexOf("function isOperatorCommentEvent"),
    );
    expect(runBlock.indexOf("routeGitHubComment")).toBeLessThan(
      runBlock.indexOf("runOSActor"),
    );
  });

  it("marks operator-only commands so later workflow steps can skip deploy and handoff", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("VIBE_OPERATOR_ONLY=1");
    expect(agentSource).toContain("process.env.GITHUB_ENV");
  });

  it("chains /approve and /continue into resume instead of operator-only exit", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("chainsIntoResume");
    expect(agentSource).toContain("resolveResumeRunId");
    expect(agentSource).toContain("readIssueRunIndex");
    expect(agentSource).toContain("process.env.VIBE_RUN_ID = runId");
    expect(agentSource).toContain('console.log(`🧭 Resuming run');
  });

  it("marks approval-required runs for workflow promotion gating", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("VIBE_APPROVAL_REQUIRED=1");
    expect(agentSource).toContain("APPROVED_BY");
    expect(agentSource).toContain("GENERATED_FILES");
  });
});
