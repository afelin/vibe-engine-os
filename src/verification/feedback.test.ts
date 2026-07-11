import { describe, expect, it } from "vitest";
import {
  createGateFailure,
  formatGateFailureMarkdown,
  formatGateFailuresMarkdown,
  serializeGateFailures,
} from "./feedback.js";

describe("gate failure feedback", () => {
  it("creates a stable gate failure schema", () => {
    const failure = createGateFailure(
      "generated_patch_file_policy",
      "outside.ts",
      "Disallowed paths: outside.ts",
      "Restrict generated files to allowed prefixes.",
    );

    expect(failure).toEqual({
      status: "gate_failed",
      gate_id: "generated_patch_file_policy",
      analysis: {
        path: "outside.ts",
        detail: "Disallowed paths: outside.ts",
      },
      remediation_instruction: "Restrict generated files to allowed prefixes.",
    });
  });

  it("renders markdown summaries for agent retry prompts", () => {
    const failure = createGateFailure(
      "typescript_compiler",
      "src/index.ts",
      "TS2835",
      "Fix TypeScript compile errors before retrying.",
    );

    expect(formatGateFailureMarkdown(failure)).toContain("### Gate failed:");
    expect(formatGateFailureMarkdown(failure)).toContain("TS2835");
  });

  it("serializes failures as JSON for machine state", () => {
    const failures = [
      createGateFailure("vitest", "tests", "expected true", "Fix failing tests."),
    ];

    expect(JSON.parse(serializeGateFailures(failures))).toEqual(failures);
    expect(formatGateFailuresMarkdown(failures)).toContain("vitest");
  });
});
