import { describe, expect, it } from "vitest";
import {
  classifyFromSymptom,
  classifyPreflightOutput,
  classifyReplayOutput,
} from "./diagnose.js";

describe("orchestrator diagnose", () => {
  it("classifies replay symptoms", () => {
    const result = classifyFromSymptom("replay mismatch on events.ndjson");
    expect(result.failureClass).toBe("replay");
    expect(result.gateId).toBe("replay_mismatch");
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
});
