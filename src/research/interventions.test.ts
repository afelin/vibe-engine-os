import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendIntervention,
  evaluateInterventionStage,
  readInterventions,
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
});
