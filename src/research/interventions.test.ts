import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendIntervention,
  applyWeeklyInterventionClosure,
  assignInterventionFollowUp,
  emitFollowUps,
  evaluateInterventionStage,
  readInterventions,
  updateInterventionStage,
} from "./interventions.js";

describe("InterventionLedger", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("appends intervention records to interventions.ndjson", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-intervention-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });

    const record = appendIntervention(root, ["src/policy/mandates.json"]);
    expect(record?.changedFiles).toContain("src/policy/mandates.json");
    expect(record?.diffHash).toBeTruthy();

    const entries = readInterventions(root);
    expect(entries).toHaveLength(1);
  });

  it("returns null when no policy files changed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-intervention-empty-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });

    expect(appendIntervention(root, [])).toBeNull();
  });

  it("classifies intervention lifecycle stage from weekly deltas", () => {
    expect(
      evaluateInterventionStage({
        firstPassGreenDelta: 0.08,
        l0l1HealShareDelta: 0.12,
        tokensMedianDelta: -120,
      }),
    ).toBe("kept");

    expect(
      evaluateInterventionStage({
        firstPassGreenDelta: -0.05,
        l0l1HealShareDelta: -0.1,
        tokensMedianDelta: 80,
      }),
    ).toBe("dropped");

    expect(
      evaluateInterventionStage({
        firstPassGreenDelta: 0,
        l0l1HealShareDelta: 0,
        tokensMedianDelta: 0,
      }),
    ).toBe("candidate");
  });

  it("backfills stage on open interventions from weeklyDelta", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-intervention-backfill-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });

    const open = appendIntervention(root, ["src/policy/mandates.json"]);
    expect(open?.id).toBeTruthy();
    expect(open?.stage).toBeUndefined();

    const closed = appendIntervention(root, ["src/release-gate/gates.json"]);
    expect(closed?.id).toBeTruthy();
    updateInterventionStage(root, closed!.id, "kept", "already closed");

    const result = applyWeeklyInterventionClosure(root, {
      firstPassGreenDelta: 0.08,
      l0l1HealShareDelta: 0.12,
      tokensMedianDelta: -120,
    });

    expect(result.stage).toBe("kept");
    expect(result.updated).toBeGreaterThanOrEqual(1);

    const entries = readInterventions(root, 50);
    const updatedOpen = entries.find((row) => row.id === open!.id);
    expect(updatedOpen?.stage).toBe("kept");
    expect(updatedOpen?.stageReason).toMatch(/weeklyDelta|firstPass|quality/i);

    const stillClosed = entries.find((row) => row.id === closed!.id);
    expect(stillClosed?.stage).toBe("kept");
    expect(stillClosed?.stageReason).toBe("already closed");
  });

  it("assigns follow-up with owner/action/dueBy and emitFollowUps writes ndjson", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-intervention-followup-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });

    const record = appendIntervention(root, ["src/policy/mandates.json"]);
    expect(record?.id).toBeTruthy();

    const dueBy = "2026-08-13T00:00:00.000Z";
    const updated = assignInterventionFollowUp(root, record!.id, {
      owner: "operator",
      action: "Retain intervention; document outcome",
      dueBy,
    });

    expect(updated?.followUp).toEqual({
      owner: "operator",
      action: "Retain intervention; document outcome",
      dueBy,
    });

    const emitted = emitFollowUps(root);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      interventionId: record!.id,
      owner: "operator",
      action: "Retain intervention; document outcome",
      dueBy,
    });
    expect(typeof emitted[0]!.emittedAt).toBe("string");

    const followupsPath = path.join(root, ".runs", "intervention-followups.ndjson");
    expect(fs.existsSync(followupsPath)).toBe(true);
    const lines = fs
      .readFileSync(followupsPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      interventionId: record!.id,
      owner: "operator",
      action: "Retain intervention; document outcome",
      dueBy,
    });
  });

  it("tags new interventions with legalSpace when active stack is set", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-intervention-space-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });
    fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".vibe", "active-stack.json"),
      JSON.stringify({
        legalSpace: "eu-nis2-cra",
        activatedAt: "2026-08-06T00:00:00.000Z",
      }),
      "utf8",
    );

    const record = appendIntervention(root, ["src/policy/mandates.json"]);
    expect(record?.legalSpace).toBe("eu-nis2-cra");
  });

  it("weekly closure assigns follow-ups for staged interventions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-intervention-closure-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });

    const open = appendIntervention(root, ["evals/taskbond-gauntlet.jsonl"]);
    applyWeeklyInterventionClosure(root, {
      firstPassGreenDelta: -0.05,
      l0l1HealShareDelta: -0.1,
      tokensMedianDelta: 80,
    });

    const entries = readInterventions(root, 50);
    const updated = entries.find((row) => row.id === open!.id);
    expect(updated?.stage).toBe("dropped");
    expect(updated?.followUp?.owner).toMatch(/engineer|operator|policy/);
    expect(updated?.followUp?.action).toBeTruthy();
    expect(updated?.followUp?.dueBy).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const followupsPath = path.join(root, ".runs", "intervention-followups.ndjson");
    expect(fs.existsSync(followupsPath)).toBe(true);
  });
});
