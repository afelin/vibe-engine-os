import { describe, expect, it } from "vitest";
import {
  classifyFromSymptom,
  classifyPreflightOutput,
  classifyReplayOutput,
  extractGauntletCaseId,
  packetFieldsFromFailedCheck,
  packetFromFailedCheck,
} from "./diagnose.js";

describe("orchestrator diagnose", () => {
  it("classifies replay symptoms", () => {
    const result = classifyFromSymptom("replay mismatch on events.ndjson");
    expect(result.failureClass).toBe("replay");
    expect(result.gateId).toBe("replay_mismatch");
  });

  it("classifies promotion gate symptoms", () => {
    const result = classifyFromSymptom("Vibe Promotion Gate failing");
    expect(result.failureClass).toBe("preflight");
    expect(result.gateId).toBe("promotion_gate");
  });

  it("parses preflight stdout", () => {
    const output = [
      "[ok] taskbond.gauntlet",
      "[FAIL] replay.deterministic: hash mismatch",
    ].join("\n");
    const result = classifyPreflightOutput(output);
    expect(result.failureClass).toBe("replay");
    expect(result.checks).toHaveLength(2);
  });

  it("classifies replay JSON output", () => {
    const fail = classifyReplayOutput(
      JSON.stringify({ ok: false, reason: "snapshot drift" }),
      false,
    );
    expect(fail.failureClass).toBe("replay");
    expect(fail.summary).toContain("snapshot drift");
  });

  it("maps CI check names to packet fields", () => {
    expect(packetFieldsFromFailedCheck("Vibe Promotion Gate")).toMatchObject({
      gateId: "promotion_gate",
      failureClass: "preflight",
    });
    expect(
      packetFieldsFromFailedCheck("Audit Assisted-by attribution"),
    ).toMatchObject({
      gateId: "attribution",
    });
    expect(packetFieldsFromFailedCheck("npm check")).toMatchObject({
      gateId: "npm_check",
    });
    const packet = packetFromFailedCheck("Vibe Promotion Gate", {
      trustTier: "experiment",
    });
    expect(packet.symptom).toContain("failing");
    expect(packet.gateId).toBe("promotion_gate");
    expect(packet.trustTier).toBe("experiment");
  });

  it("classifies top gateIdsFailed-style symptoms via static table", () => {
    expect(classifyFromSymptom("vitest suite failed")).toMatchObject({
      gateId: "vitest",
      failureClass: "preflight",
    });
    expect(classifyFromSymptom("tsc type error in src/foo.ts")).toMatchObject({
      gateId: "typescript_compiler",
    });
  });

  it("extracts gauntlet case ids from FAIL lines", () => {
    expect(
      extractGauntletCaseId(
        'FAIL missing_intent_01 (missing_intent): expected {"ok":false}',
      ),
    ).toBe("missing_intent_01");
    const classified = classifyPreflightOutput(
      "[FAIL] taskbond.gauntlet: FAIL forbidden_01 (forbidden): expected",
    );
    expect(classified.failureClass).toBe("gauntlet");
    expect(classified.gauntletCaseId).toBe("forbidden_01");
    expect(classified.summary).toContain("gauntlet case: forbidden_01");
  });

  it("extracts gauntlet case ids from regression lines", () => {
    expect(
      extractGauntletCaseId("path_escape_03: was pass, now fail"),
    ).toBe("path_escape_03");
    const classified = classifyFromSymptom(
      "taskbond gauntlet regression path_escape_03: was pass, now fail",
    );
    expect(classified.failureClass).toBe("gauntlet");
    expect(classified.gauntletCaseId).toBe("path_escape_03");
  });
});
