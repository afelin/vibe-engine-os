import { describe, expect, it } from "vitest";
import { sealTaskBond } from "./seal.js";

describe("sealTaskBond", () => {
  it("seals a valid bond with hash", () => {
    const result = sealTaskBond({
      issueNumber: "42",
      issueTitle: "Health check",
      issueBody: `### Intent (one sentence)
Add health endpoint

### Files to touch (exact paths)
src/health.ts
`,
      depth: 3,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bond.bondHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.bond.issueNumber).toBe("42");
      expect(result.bond.boundFiles).toContain("src/health.ts");
    }
  });

  it("rejects bond without bound files at depth 3", () => {
    const result = sealTaskBond({
      issueNumber: "1",
      issueTitle: "Vague",
      issueBody: "### Intent (one sentence)\nDo something vague",
      depth: 3,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toMatch(/boundFiles|missing_bound_files/i);
    }
  });
});
