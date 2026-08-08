import { describe, expect, it } from "vitest";
import { axDenial, axDenialFromReason, nextStepForCode } from "./ax-denial.js";

describe("Ax denial", () => {
  it("builds compact denial with next step", () => {
    const d = axDenial({
      code: "house_forbidden",
      paths: ["src/auth/x.ts"],
    });
    expect(d.ok).toBe(false);
    expect(d.code).toBe("house_forbidden");
    expect(d.paths).toEqual(["src/auth/x.ts"]);
    expect(d.next.length).toBeGreaterThan(10);
  });

  it("surfaces prefer_gate short-circuit", () => {
    const d = axDenialFromReason(
      "needs_approval;prefer_gate:add-unit-test",
      ["src/a.ts"],
    );
    expect(d.code).toBe("needs_approval");
    expect(d.prefer_gate).toBe("add-unit-test");
    expect(d.next).toContain("add-unit-test");
  });

  it("documents authorize → prefer_gate → ContextPack → LLM order", () => {
    expect(nextStepForCode("prefer_gate", "x")).toContain("skip ContextPack");
  });
});
