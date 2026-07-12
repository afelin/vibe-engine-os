import { describe, expect, it } from "vitest";
import {
  AUTO_MERGE_LABEL,
  evaluateMergeReadiness,
  pickAttributionCheck,
  pickPromotionCheck,
  requireAutoMergeLabel,
  type CheckRunSnapshot,
  type PullRequestSnapshot,
} from "./auto-merge.js";

function samplePr(overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot {
  return {
    number: 15,
    state: "open",
    merged: false,
    mergeable: true,
    mergeable_state: "clean",
    html_url: "https://github.com/org/repo/pull/15",
    head: { sha: "abc123" },
    labels: [{ name: AUTO_MERGE_LABEL }],
    ...overrides,
  };
}

const greenPromotion: CheckRunSnapshot = {
  name: "Vibe Promotion Gate",
  status: "completed",
  conclusion: "success",
};

const greenAttribution: CheckRunSnapshot = {
  name: "Audit Assisted-by attribution",
  status: "completed",
  conclusion: "success",
};

describe("auto-merge policy", () => {
  it("requires the vibe/auto-merge label by default", () => {
    const verdict = requireAutoMergeLabel(samplePr({ labels: [] }), true);
    expect(verdict?.reason).toBe("missing_auto_merge_label");
  });

  it("skips label requirement when disabled", () => {
    expect(requireAutoMergeLabel(samplePr({ labels: [] }), false)).toBeNull();
  });

  it("reports already merged PRs as success", () => {
    const verdict = requireAutoMergeLabel(
      samplePr({ merged: true, state: "closed" }),
      true,
    );
    expect(verdict).toMatchObject({ ok: true, reason: "already_merged" });
  });

  it("blocks when mergeable_state is not clean", () => {
    const verdict = evaluateMergeReadiness(
      samplePr({ mergeable_state: "blocked" }),
      greenPromotion,
      greenAttribution,
    );
    expect(verdict.reason).toBe("mergeable_state_blocked");
  });

  it("blocks when Vibe Promotion Gate is missing or not green", () => {
    const verdict = evaluateMergeReadiness(samplePr(), null, greenAttribution);
    expect(verdict.reason).toBe("promotion_gate_not_green");
  });

  it("blocks when attribution audit is missing or not green", () => {
    const verdict = evaluateMergeReadiness(samplePr(), greenPromotion, null);
    expect(verdict.reason).toBe("attribution_gate_not_green");
  });

  it("allows merge when branch is clean and both gates succeeded", () => {
    const verdict = evaluateMergeReadiness(
      samplePr(),
      greenPromotion,
      greenAttribution,
    );
    expect(verdict).toMatchObject({ ok: true, reason: "ready_to_merge" });
  });

  it("selects the promotion gate check by name", () => {
    const picked = pickPromotionCheck([
      { name: "check", status: "completed", conclusion: "success" },
      greenPromotion,
    ]);
    expect(picked?.name).toBe("Vibe Promotion Gate");
  });

  it("selects the attribution audit check by name", () => {
    const picked = pickAttributionCheck([
      { name: "lint", status: "completed", conclusion: "success" },
      greenAttribution,
    ]);
    expect(picked?.name).toBe("Audit Assisted-by attribution");
  });

  it("falls back to legacy attribution-audit job name", () => {
    const picked = pickAttributionCheck([
      { name: "attribution-audit", status: "completed", conclusion: "success" },
    ]);
    expect(picked?.name).toBe("attribution-audit");
  });
});

describe("attemptAutoMerge integration", () => {
  it("dry-runs merge when policy passes", async () => {
    const { attemptAutoMerge } = await import("./auto-merge.js");
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/pulls/42") && init?.method !== "PUT") {
        return Response.json(samplePr({ number: 42 }));
      }
      if (url.includes("/check-runs")) {
        return Response.json({ check_runs: [greenPromotion, greenAttribution] });
      }
      if (url.endsWith("/merge")) {
        throw new Error("should not merge in dry run");
      }
      return Response.json({});
    };

    const verdict = await attemptAutoMerge({
      pullNumber: 42,
      dryRun: true,
      requireLabel: true,
      token: "test-token",
      repository: "org/repo",
      fetchFn: fetchMock as typeof fetch,
    });

    expect(verdict).toMatchObject({ ok: true, reason: "dry_run_ready", prNumber: 42 });
  });
});
