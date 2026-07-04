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
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain('fs.existsSync("AGENTS.md")');
    expect(agentSource).toContain('"agent.md"');
  });

  it("validates generated patches before writing them to disk", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );
    const validatorIndex = agentSource.indexOf("runGeneratedPatchValidators");
    const writeIndex = agentSource.indexOf("fs.writeFileSync(file.path");

    expect(validatorIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(-1);
    expect(validatorIndex).toBeLessThan(writeIndex);
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

  it("routes operator comments before model inference starts", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );
    const routerIndex = agentSource.indexOf("routeGitHubComment");
    const modelIndex = agentSource.indexOf("Phase 1: Planning Architecture");

    expect(agentSource).toContain("./src/operator/github-comment-router.js");
    expect(agentSource).toContain("./src/os/event-ledger.js");
    expect(agentSource).toContain("./src/run/rollback.js");
    expect(agentSource).toContain("appendOperatorEvent");
    expect(agentSource).toContain("markOperatorOnlyFromEnv");
    expect(agentSource).toContain("readLatestRollbackInstructions");
    expect(routerIndex).toBeGreaterThan(-1);
    expect(modelIndex).toBeGreaterThan(-1);
    expect(routerIndex).toBeLessThan(modelIndex);
  });

  it("marks operator-only commands so later workflow steps can skip deploy and handoff", () => {
    const agentSource = fs.readFileSync(
      path.join(process.cwd(), "agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("VIBE_OPERATOR_ONLY=1");
    expect(agentSource).toContain("process.env.GITHUB_ENV");
  });
});
