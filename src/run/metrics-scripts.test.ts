import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const runsDir = join(root, ".runs");
const scoreboardPath = join(runsDir, "scoreboard.ndjson");
const backupPath = join(runsDir, "scoreboard.ndjson.bak.test");

function restoreScoreboard() {
  if (existsSync(backupPath)) {
    if (existsSync(scoreboardPath)) rmSync(scoreboardPath);
    renameSync(backupPath, scoreboardPath);
    return;
  }
  if (existsSync(scoreboardPath)) rmSync(scoreboardPath);
}

describe("metrics scripts machine-readable modes", () => {
  afterEach(() => {
    restoreScoreboard();
  });

  it("scoreboard.sh --json prints parseable summary JSON", () => {
    mkdirSync(runsDir, { recursive: true });
    if (existsSync(scoreboardPath)) renameSync(scoreboardPath, backupPath);

    const fixture = [
      {
        runId: "r1",
        issueNumber: "1",
        issueTitle: "one",
        success: true,
        state: "completed",
        createdAt: new Date().toISOString(),
        metrics: {
          attempts: 1,
          firstPassGreen: true,
          gateIdsFailed: [],
          durationMs: 10,
          healLevel: 0,
          deterministicFix: true,
          tokensEstimate: 0,
        },
      },
      {
        runId: "r2",
        issueNumber: "2",
        issueTitle: "two",
        success: false,
        state: "failed",
        createdAt: new Date().toISOString(),
        metrics: {
          attempts: 2,
          firstPassGreen: false,
          gateIdsFailed: ["vitest"],
          durationMs: 20,
          healLevel: 1,
          deterministicFix: true,
          tokensEstimate: 12,
        },
      },
    ];
    writeFileSync(scoreboardPath, fixture.map((f) => JSON.stringify(f)).join("\n") + "\n");

    const result = spawnSync("bash", ["runs/scoreboard.sh", "--json"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as { runs: number; healMix: { n: number } };
    expect(parsed.runs).toBe(2);
    expect(parsed.healMix.n).toBe(2);
  });

  it("autoresearch.sh --summary-json prints parseable summary JSON", () => {
    const result = spawnSync("bash", ["runs/autoresearch.sh", "--summary-json"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as {
      fixtures: number;
      scoreboardHeal: null | { n: number };
    };
    expect(parsed.fixtures).toBeGreaterThan(0);
    expect(parsed).toHaveProperty("scoreboardHeal");
  });

  it("autoresearch.sh writes a dated research report", () => {
    const date = new Date().toISOString().slice(0, 10);
    const outPath = join(root, ".runs", "research", `${date}.json`);
    if (existsSync(outPath)) rmSync(outPath);

    const result = spawnSync("bash", ["runs/autoresearch.sh", "--summary-json"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    const report = JSON.parse(readFileSync(outPath, "utf8")) as { fixtures: number };
    expect(report.fixtures).toBeGreaterThan(0);
  });
});
