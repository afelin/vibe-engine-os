import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildWeeklyPearlDeltaFromReport,
  renderWeeklyPearlSummary,
} from "../research/pearl-summary.js";

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
        source?: string;
      };
    };
    expect(parsed).toHaveProperty("weeklyDelta");
    if (parsed.weeklyDelta) {
      expect(typeof parsed.weeklyDelta.firstPassGreenDelta).toBe("number");
      expect(typeof parsed.weeklyDelta.l0l1HealShareDelta).toBe("number");
      expect(typeof parsed.weeklyDelta.tokensMedianDelta).toBe("number");
    }
  });

  it("renders a Weekly Pearl markdown story from weeklyDelta", () => {
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
        source?: string;
      };
    };

    const delta = buildWeeklyPearlDeltaFromReport(parsed, process.cwd());
    const body = renderWeeklyPearlSummary(delta ?? parsed.weeklyDelta);

    expect(body).toContain("Weekly Pearl");
    if (parsed.weeklyDelta) {
      expect(body).toMatch(/first[- ]pass/i);
      expect(body).toMatch(/L0\/L1/i);
      expect(body).toMatch(/token/i);
    } else {
      expect(body).toMatch(/unavailable|no prior/i);
    }
    expect(body).toMatch(/intervention/i);
  });
});
