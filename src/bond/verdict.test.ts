import { describe, expect, it } from "vitest";
import {
  formatMandateVerdict,
  formatSealVerdict,
  formatTaskBondEvalVerdict,
} from "./verdict.js";
import { evaluateTaskBond } from "./evaluate.js";
import { sealTaskBond } from "./seal.js";

describe("bond verdict envelopes", () => {
  it("formats passing mandate as ok:true", () => {
    expect(formatMandateVerdict({
      passed: true,
      violations: [],
      requiresApproval: false,
      maxAttempts: 3,
    })).toEqual({ ok: true });
  });

  it("formats approval-only mandate as ok:true with requiresApproval", () => {
    const verdict = formatMandateVerdict({
      passed: true,
      violations: [{ path: "package.json", rule: "require_approval", prefix: "package.json" }],
      requiresApproval: true,
      maxAttempts: 3,
    });
    expect(verdict).toMatchObject({
      ok: true,
      requiresApproval: true,
      approvalPaths: ["package.json"],
    });
  });

  it("formats forbidden mandate with reason", () => {
    const verdict = formatMandateVerdict({
      passed: false,
      violations: [{ path: "src/auth/x.ts", rule: "forbidden", prefix: "src/auth/" }],
      requiresApproval: false,
      maxAttempts: 3,
    });
    expect(verdict).toMatchObject({ ok: false, reason: "forbidden_prefix" });
  });

  it("formats missing_bound_files from evaluation", () => {
    const evaluation = evaluateTaskBond(
      { intent: "x", outcomes: [], boundFiles: [], constraints: [] },
      3,
    );
    expect(formatTaskBondEvalVerdict(evaluation)).toMatchObject({
      ok: false,
      reason: "missing_bound_files",
    });
  });

  it("formats seal success with bondHash", () => {
    const result = sealTaskBond({
      issueNumber: "1",
      issueTitle: "t",
      issueBody: "### Intent (one sentence)\nDo thing\n\n### Files to touch (exact paths)\nsrc/a.ts\n",
      depth: 3,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(formatSealVerdict(result)).toMatchObject({
        ok: true,
        bondHash: result.bond.bondHash,
      });
    }
  });
});
