import { describe, expect, it } from "vitest";
import { evaluateMandates, loadMandates } from "./evaluate.js";

describe("agent mandate evaluation", () => {
  it("loads mandate policy from json", () => {
    const mandates = loadMandates(".");
    expect(mandates.forbidden_prefixes).toContain("src/auth/");
    expect(mandates.max_attempts).toBe(3);
    expect(mandates.approved_operators).toEqual(["afelin"]);
  });

  it("blocks forbidden prefixes before codegen", () => {
    const result = evaluateMandates(["src/auth/session.ts"]);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.rule).toBe("forbidden");
  });

  it("marks approval-required prefixes without failing the mandate check", () => {
    const result = evaluateMandates([".github/CODEOWNERS"]);
    expect(result.passed).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("marks approval-required package.json paths", () => {
    const result = evaluateMandates(["package.json"]);
    expect(result.requiresApproval).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("passes ordinary generated source paths", () => {
    const result = evaluateMandates(["src/index.ts", "src/index.test.ts"]);
    expect(result.passed).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });
});
