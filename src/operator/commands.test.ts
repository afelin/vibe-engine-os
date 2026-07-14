import { describe, expect, it } from "vitest";
import { parseOperatorCommand } from "./commands.js";

describe("operator commands", () => {
  it("parses supported slash commands", () => {
    expect(parseOperatorCommand("/plan")).toEqual({ type: "plan" });
    expect(parseOperatorCommand("/approve")).toEqual({ type: "approve" });
    expect(parseOperatorCommand("/retry please")).toEqual({ type: "retry" });
    expect(parseOperatorCommand("/rollback")).toEqual({ type: "rollback" });
    expect(parseOperatorCommand("/status")).toEqual({ type: "status" });
    expect(parseOperatorCommand("/deploy")).toEqual({ type: "deploy" });
    expect(parseOperatorCommand("/continue")).toEqual({ type: "continue" });
    expect(parseOperatorCommand("/details")).toEqual({ type: "details" });
    expect(parseOperatorCommand("/troubleshoot replay mismatch")).toEqual({
      type: "troubleshoot",
      symptom: "replay mismatch",
    });
  });

  it("keeps unknown commands non-mutating", () => {
    expect(parseOperatorCommand("/shipit")).toEqual({
      type: "unknown",
      raw: "/shipit",
    });
  });
});
