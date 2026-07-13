import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readGateFeedbackEntry,
  resolveRemediation,
  writeGateFeedbackEntry,
} from "./feedback-cache.js";

describe("GateFeedbackCache", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes and reads cached remediation by gate id", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-gate-cache-"));
    tmpDirs.push(root);

    writeGateFeedbackEntry(root, {
      gate_id: "bond_compliance",
      remediation_instruction: "Stay within bound paths.",
      examples: ["src/planned.ts"],
    });

    const cached = readGateFeedbackEntry(root, "bond_compliance");
    expect(cached?.remediation_instruction).toContain("bound paths");
    expect(cached?.cacheHash).toHaveLength(64);
  });

  it("resolveRemediation prefers cache over fallback", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-gate-resolve-"));
    tmpDirs.push(root);

    writeGateFeedbackEntry(root, {
      gate_id: "vitest",
      remediation_instruction: "Cached vitest fix.",
    });

    const resolved = resolveRemediation(root, "vitest", "fallback");
    expect(resolved.instruction).toBe("Cached vitest fix.");
    expect(resolved.cacheHash).toBeDefined();
  });
});
