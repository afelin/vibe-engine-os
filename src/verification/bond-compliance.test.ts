import { describe, expect, it } from "vitest";
import { validateBondCompliance } from "./bond-compliance.js";

describe("BondComplianceValidator", () => {
  const allowed = ["src/planned.ts", "src/planned.test.ts"];

  it("passes when all generated paths are in planned union bound set", () => {
    const result = validateBondCompliance(
      [
        { path: "src/planned.ts", content: "export const ok = true;" },
        {
          path: "src/planned.test.ts",
          content: 'import { ok } from "./planned.js";',
        },
      ],
      allowed,
    );

    expect(result.passed).toBe(true);
    expect(result.hallucinationBlocked).toBe(false);
  });

  it("blocks hallucinated paths outside planned set", () => {
    const result = validateBondCompliance(
      [{ path: "src/escape.ts", content: "export const sneaky = true;" }],
      allowed,
    );

    expect(result.passed).toBe(false);
    expect(result.hallucinationBlocked).toBe(true);
    expect(result.gateFailures[0]).toMatchObject({
      gate_id: "bond_compliance",
      analysis: { path: "src/escape.ts" },
    });
  });

  it("blocks forbidden mandate paths even when in planned set", () => {
    const result = validateBondCompliance(
      [{ path: "src/auth/session.ts", content: "export const blocked = true;" }],
      ["src/auth/session.ts"],
    );

    expect(result.passed).toBe(false);
    expect(result.gateFailures.some((f) => f.gate_id === "bond_compliance")).toBe(
      true,
    );
  });
});
