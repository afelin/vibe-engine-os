import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("metrics check script", () => {
  it("runs successfully and emits summary", () => {
    const dir = mkdtempSync(join(tmpdir(), "metrics-check-"));
    const scoreboard = join(dir, "scoreboard.ndjson");
    writeFileSync(scoreboard, "");
    const result = spawnSync("node", ["scripts/metrics-check.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, VIBE_SCOREBOARD_PATH: scoreboard },
    });

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain("metrics-check:");
  });
});
