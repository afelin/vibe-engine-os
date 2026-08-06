import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendScoreboardEntry,
  readScoreboardEntries,
  renderRollbackInstructions,
  summarizeHealMix,
  writeRunManifest,
} from "./manifest.js";

describe("run manifest", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("writes rollback metadata for a run", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-run-"));
    tmpDirs.push(root);

    writeRunManifest(root, {
      runId: "run_001",
      issueNumber: "1",
      issueTitle: "Test",
      branchName: "vibe/issue-1",
      baseSha: "abc123",
      generatedFiles: ["src/index.ts"],
      createdAt: "2026-07-04T00:00:00.000Z",
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        gateIdsFailed: [],
        durationMs: 42,
      },
    });

    const manifestPath = path.join(root, ".runs", "run_001", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    expect(manifest).toMatchObject({
      runId: "run_001",
      issueNumber: "1",
      baseSha: "abc123",
      generatedFiles: ["src/index.ts"],
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        durationMs: 42,
      },
    });
  });

  it("appends scoreboard ndjson entries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-score-"));
    tmpDirs.push(root);

    appendScoreboardEntry(root, {
      runId: "run_a",
      issueNumber: "1",
      issueTitle: "A",
      success: true,
      state: "completed",
      createdAt: "2026-07-04T00:00:00.000Z",
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        gateIdsFailed: [],
        durationMs: 10,
      },
    });
    appendScoreboardEntry(root, {
      runId: "run_b",
      issueNumber: "2",
      issueTitle: "B",
      success: false,
      state: "failed",
      createdAt: "2026-07-04T00:01:00.000Z",
      metrics: {
        attempts: 3,
        firstPassGreen: false,
        gateIdsFailed: ["vitest"],
        durationMs: 99,
      },
    });

    const entries = readScoreboardEntries(root, 20);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.runId).toBe("run_b");
    expect(entries[1]?.metrics.firstPassGreen).toBe(true);
  });

  it("summarizes heal mix percentages from scoreboard rows", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-heal-mix-"));
    tmpDirs.push(root);

    for (const [runId, healLevel] of [
      ["r0", 0],
      ["r1", 1],
      ["r2", 1],
      ["r3", 3],
    ] as const) {
      appendScoreboardEntry(root, {
        runId,
        issueNumber: "1",
        issueTitle: runId,
        success: healLevel <= 1,
        state: "troubleshoot.healed",
        createdAt: "2026-07-04T00:00:00.000Z",
        metrics: {
          attempts: 1,
          firstPassGreen: healLevel <= 1,
          gateIdsFailed: [],
          durationMs: 1,
          tokensEstimate: healLevel,
          healLevel,
          healOutcome: healLevel <= 1 ? "guidance_delivered" : "escalated",
          agentSlot: healLevel === 3 ? "human" : "feedback-cache",
          deterministicFix: healLevel <= 1,
        },
      });
    }

    const mix = summarizeHealMix(readScoreboardEntries(root, 20));
    expect(mix.withHealLevel).toBe(4);
    expect(mix.pct.l0).toBe(25);
    expect(mix.pct.l1).toBe(50);
    expect(mix.pct.l3).toBe(25);
    expect(mix.lastHealLevel).toBe(3);
    expect(mix.lastHealRunId).toBe("r3");
    expect(mix.lastAgentSlot).toBe("human");
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
