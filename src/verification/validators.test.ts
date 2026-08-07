import { describe, expect, it } from "vitest";
import {
  normalizeEsmImportExtensions,
  validateEsmImportExtensions,
  validateFilePolicy,
  validateNoPathTraversal,
  validateNoSecrets,
  validateProtectedFiles,
} from "./validators.js";

describe("deterministic validators", () => {
  it("allows generated patches only in generated-code paths", () => {
    const result = validateFilePolicy("generated_patch", [
      { path: "src/index.ts", content: "" },
      { path: "tests/index.test.ts", content: "" },
      { path: ".planning/plan.md", content: "" },
      { path: ".skills/actor.ts", content: "" },
    ]);

    expect(result.passed).toBe(true);
  });

  it("rejects generated patches outside the allowlist", () => {
    const result = validateFilePolicy("generated_patch", [
      { path: "README.md", content: "" },
    ]);

    expect(result.passed).toBe(false);
    expect(result.output).toContain("README.md");
  });

  it("allows maintainer changes in docs and runs", () => {
    const result = validateFilePolicy("maintainer_change", [
      { path: "docs/superpowers/plans/roadmap.md", content: "" },
      { path: "runs/smoke.sh", content: "" },
    ]);

    expect(result.passed).toBe(true);
  });

  it("flags protected files as requiring approval", () => {
    const result = validateProtectedFiles([
      { path: ".github/workflows/forever.yml", content: "" },
      { path: "package.json", content: "" },
      { path: "src/policy/mandates.json", content: "" },
      { path: ".vibe/active_mandate.json", content: "" },
    ]);

    expect(result.passed).toBe(false);
    expect(result.output).toContain(".github/workflows/forever.yml");
    expect(result.output).toContain("package.json");
    expect(result.output).toContain("src/policy/mandates.json");
    expect(result.output).toContain(".vibe/active_mandate.json");
  });

  it("rejects path traversal", () => {
    const result = validateNoPathTraversal([
      { path: "../outside.ts", content: "" },
    ]);

    expect(result.passed).toBe(false);
  });

  it("catches local ESM imports without .js extensions", () => {
    const result = validateEsmImportExtensions([
      { path: "src/main.ts", content: 'import { value } from "./value";' },
    ]);

    expect(result.passed).toBe(false);
    expect(result.output).toContain("src/main.ts");
  });

  it("accepts local ESM imports with .js extensions", () => {
    const result = validateEsmImportExtensions([
      { path: "src/main.ts", content: 'import { value } from "./value.js";' },
    ]);

    expect(result.passed).toBe(true);
  });

  it("normalizes missing .js extensions on relative imports", () => {
    const normalized = normalizeEsmImportExtensions([
      { path: "src/main.test.ts", content: 'import { value } from "./main";' },
    ]);

    expect(normalized[0]?.content).toContain('./main.js"');
  });

  it("flags secret-like patterns in generated files", () => {
    const result = validateNoSecrets([
      { path: "src/config.ts", content: 'export const key = "ghp_1234567890123456789012345678901234";' },
    ]);

    expect(result.passed).toBe(false);
    expect(result.output).toContain("github_token");
  });

  it("passes clean generated files through secret scan", () => {
    const result = validateNoSecrets([
      { path: "src/index.ts", content: "export const ok = true;\n" },
    ]);

    expect(result.passed).toBe(true);
  });
});
