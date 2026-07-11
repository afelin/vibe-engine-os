import { describe, expect, it } from "vitest";
import { runGeneratedPatchValidators } from "./pipeline.js";

describe("generated patch validator pipeline", () => {
  it("passes safe generated source and test files", () => {
    const result = runGeneratedPatchValidators([
      { path: "src/machine.ts", content: "export const ok = true;" },
      {
        path: "src/machine.test.ts",
        content: 'import { ok } from "./machine.js";',
      },
    ]);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("returns structured gate failures for validator failures", () => {
    const result = runGeneratedPatchValidators([
      { path: "../outside.ts", content: "export {};" },
    ]);

    expect(result.passed).toBe(false);
    expect(result.gateFailures[0]).toMatchObject({
      status: "gate_failed",
      gate_id: "path_traversal",
      analysis: expect.objectContaining({
        path: "../outside.ts",
      }),
    });
  });

  it("fails before writes for protected files", () => {
    const result = runGeneratedPatchValidators([
      { path: ".github/workflows/forever.yml", content: "name: unsafe" },
    ]);

    expect(result.passed).toBe(false);
    expect(result.failures.join("\n")).toContain("Protected paths require approval");
  });

  it("fails before writes for unsafe traversal paths", () => {
    const result = runGeneratedPatchValidators([
      { path: "../outside.ts", content: "export {};" },
    ]);

    expect(result.passed).toBe(false);
    expect(result.failures.join("\n")).toContain("Unsafe paths");
  });
});
