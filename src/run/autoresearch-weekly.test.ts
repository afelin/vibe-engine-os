import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("autoresearch weekly summary", () => {
  it("emits a stable weeklyDelta block in --summary-json mode", () => {
    const first = spawnSync("bash", ["runs/autoresearch.sh", "--summary-json"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(first.status).toBe(0);

    const second = spawnSync("bash", ["runs/autoresearch.sh", "--summary-json"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(second.status).toBe(0);

    const parsed = JSON.parse(second.stdout.trim()) as {
      weeklyDelta: null | {
        firstPassGreenDelta: number;
        l0l1HealShareDelta: number;
        tokensMedianDelta: number;
      };
    };
    expect(parsed).toHaveProperty("weeklyDelta");
    if (parsed.weeklyDelta) {
      expect(typeof parsed.weeklyDelta.firstPassGreenDelta).toBe("number");
      expect(typeof parsed.weeklyDelta.l0l1HealShareDelta).toBe("number");
      expect(typeof parsed.weeklyDelta.tokensMedianDelta).toBe("number");
    }
  });
});
