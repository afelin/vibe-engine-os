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
});
