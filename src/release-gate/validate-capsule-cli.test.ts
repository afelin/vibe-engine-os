import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { callReleaseGateTool } from "./mcp-handlers.js";
import { computeVowsHash } from "../constitution/vows.js";

describe("validate-capsule-cli", () => {
  it("validates a manifest on disk via MCP handler", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-capsule-cli-"));
    const runId = "run-cli-test";
    const runDir = path.join(root, ".runs", runId);
    const vowsDir = path.join(root, "src/constitution");
    fs.mkdirSync(vowsDir, { recursive: true });
    fs.mkdirSync(runDir, { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), "src/constitution/vows.json"),
      path.join(vowsDir, "vows.json"),
    );

    fs.writeFileSync(
      path.join(runDir, "manifest.json"),
      `${JSON.stringify({
        runId,
        issueNumber: "1",
        issueTitle: "Test",
        branchName: "main",
        baseSha: "abc",
        generatedFiles: [],
        createdAt: "2026-07-04T00:00:00.000Z",
        vowsHash: computeVowsHash(root),
        metrics: {
          attempts: 1,
          firstPassGreen: true,
          gateIdsFailed: [],
          durationMs: 1,
        },
      })}\n`,
    );

    const text = callReleaseGateTool("validate_capsule", {
      root_dir: root,
      run_id: runId,
    });
    const parsed = JSON.parse(text);

    expect(parsed.valid).toBe(true);
    expect(parsed.capsuleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.vowsCompliant).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
