import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendIntervention,
  applyWeeklyInterventionClosure,
} from "./interventions.js";
import {
  buildWeeklyPearlDeltaFromReport,
  countInterventionStages,
  renderWeeklyPearlSummary,
  type WeeklyPearlDelta,
} from "./pearl-summary.js";

describe("renderWeeklyPearlSummary", () => {
  it("renders first-pass, L0/L1 share, and token median deltas", () => {
    const delta: WeeklyPearlDelta = {
      firstPassGreenDelta: 0.08,
      l0l1HealShareDelta: 0.12,
      tokensMedianDelta: -120,
    };

    const body = renderWeeklyPearlSummary(delta);

    expect(body).toContain("Weekly Pearl");
    expect(body).toMatch(/first[- ]pass/i);
    expect(body).toContain("+0.0800");
    expect(body).toMatch(/L0\/L1/i);
    expect(body).toContain("+0.1200");
    expect(body).toMatch(/token/i);
    expect(body).toContain("-120");
  });

  it("includes intervention stage counts when provided", () => {
    const body = renderWeeklyPearlSummary({
      firstPassGreenDelta: 0,
      l0l1HealShareDelta: 0,
      tokensMedianDelta: 0,
      interventionStages: { candidate: 2, kept: 1, dropped: 0 },
    });

    expect(body).toMatch(/intervention/i);
    expect(body).toMatch(/\*\*candidate:\*\*\s*2/i);
    expect(body).toMatch(/\*\*kept:\*\*\s*1/i);
    expect(body).toMatch(/\*\*dropped:\*\*\s*0/i);
  });

  it("labels stages as not yet written when counts are absent", () => {
    const body = renderWeeklyPearlSummary({
      firstPassGreenDelta: 0.01,
      l0l1HealShareDelta: -0.02,
      tokensMedianDelta: 10,
    });

    expect(body).toMatch(/intervention/i);
    expect(body).toMatch(/not yet staged|stages not written|0 \(not yet/i);
  });

  it("renders a null-delta notice when weeklyDelta is missing", () => {
    const body = renderWeeklyPearlSummary(null);

    expect(body).toContain("Weekly Pearl");
    expect(body).toMatch(/no prior|unavailable|null/i);
  });
});

describe("countInterventionStages", () => {
  it("counts candidate/kept/dropped from intervention records", () => {
    expect(
      countInterventionStages([
        { stage: "candidate" },
        { stage: "kept" },
        { stage: "kept" },
        { stage: "dropped" },
        {},
      ]),
    ).toEqual({ candidate: 1, kept: 2, dropped: 1 });
  });

  it("returns zeros when no stages are written yet", () => {
    expect(countInterventionStages([{}, { stage: undefined }])).toEqual({
      candidate: 0,
      kept: 0,
      dropped: 0,
    });
  });
});

describe("buildWeeklyPearlDeltaFromReport with staged interventions", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("includes real stage counts once weekly closure writes stages", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-pearl-stages-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });

    appendIntervention(root, ["src/policy/mandates.json"]);
    applyWeeklyInterventionClosure(root, {
      firstPassGreenDelta: 0.08,
      l0l1HealShareDelta: 0.12,
      tokensMedianDelta: -120,
    });

    const delta = buildWeeklyPearlDeltaFromReport(
      {
        weeklyDelta: {
          firstPassGreenDelta: 0.08,
          l0l1HealShareDelta: 0.12,
          tokensMedianDelta: -120,
          source: "2026-07-30.json",
        },
      },
      root,
    );

    expect(delta?.interventionStages).toEqual({
      candidate: 0,
      kept: 1,
      dropped: 0,
    });
    expect(delta?.interventionStagesFromLedger).toBe(true);

    const body = renderWeeklyPearlSummary(delta);
    expect(body).toMatch(/\*\*kept:\*\*\s*1/i);
    expect(body).not.toMatch(/stages not written yet/i);
  });
});
