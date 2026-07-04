import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { renderRollbackInstructions, writeRunManifest } from "./manifest.js";

describe("run manifest", () => {
  it("writes rollback metadata for a run", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-run-"));

    writeRunManifest(root, {
      runId: "run_001",
      issueNumber: "1",
      issueTitle: "Test",
      branchName: "vibe/issue-1",
      baseSha: "abc123",
      generatedFiles: ["src/index.ts"],
      createdAt: "2026-07-04T00:00:00.000Z",
    });

    const manifestPath = path.join(root, ".runs", "run_001", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    expect(manifest).toMatchObject({
      runId: "run_001",
      issueNumber: "1",
      baseSha: "abc123",
      generatedFiles: ["src/index.ts"],
    });
  });

  it("renders rollback instructions with the base sha and branch", () => {
    const text = renderRollbackInstructions({
      runId: "run_001",
      issueNumber: "1",
      issueTitle: "Test",
      branchName: "vibe/issue-1",
      baseSha: "abc123",
      generatedFiles: [],
      createdAt: "2026-07-04T00:00:00.000Z",
    });

    expect(text).toContain("Rollback run_001");
    expect(text).toContain("vibe/issue-1");
    expect(text).toContain("abc123");
    expect(text).toContain("git diff abc123..HEAD");
  });
});
