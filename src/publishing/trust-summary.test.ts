import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATTRIBUTION_CHECK_NAME,
  PROMOTION_CHECK_NAME,
} from "./github-checks.js";
import {
  renderTrustSummary,
  trustSummaryCommentMarker,
  type TrustSummaryContext,
} from "./trust-summary.js";
import type {
  CheckRunSnapshot,
  PullRequestSnapshot,
} from "../promote/auto-merge.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-trust-summary-"));
  tempDirs.push(dir);
  return dir;
}

function samplePr(
  overrides: Partial<PullRequestSnapshot> = {},
): PullRequestSnapshot {
  return {
    number: 42,
    state: "open",
    merged: false,
    mergeable: true,
    mergeable_state: "clean",
    html_url: "https://github.com/org/repo/pull/42",
    head: { sha: "abc123" },
    labels: [],
    ...overrides,
  };
}

const greenPromotion: CheckRunSnapshot = {
  name: PROMOTION_CHECK_NAME,
  status: "completed",
  conclusion: "success",
};

const failingAttribution: CheckRunSnapshot = {
  name: ATTRIBUTION_CHECK_NAME,
  status: "completed",
  conclusion: "failure",
};

function baseCtx(
  overrides: Partial<TrustSummaryContext> = {},
): TrustSummaryContext {
  return {
    state: "completed",
    runId: "run-1",
    capsuleHash: "capsuledeadbeef",
    vowsHash: "vowsdeadbeef",
    repository: "org/repo",
    proofBase: "https://example.test/proof",
    pr: samplePr(),
    promotionCheck: greenPromotion,
    attributionCheck: failingAttribution,
    ...overrides,
  };
}

describe("renderTrustSummary", () => {
  it("shows blocking reason when required checks are mixed pass/fail", () => {
    const summary = renderTrustSummary(baseCtx());

    expect(summary).toContain("## Trust summary");
    expect(summary).toMatch(/Coreward Promotion Gate.*pass|Vibe Promotion Gate.*pass|✅/i);
    expect(summary).toMatch(/attribution.*fail|❌/i);
    expect(summary).toContain("attribution_gate_not_green");
    expect(summary).toMatch(/Next action/i);
    expect(summary).toContain("Blocked");
  });

  it("includes active legal space when set via active-stack.json", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".vibe", "active-stack.json"),
      JSON.stringify({
        legalSpace: "eu-nis2-cra",
        activatedAt: "2026-08-06T00:00:00.000Z",
      }),
      "utf8",
    );

    const summary = renderTrustSummary(
      baseCtx({
        rootDir: root,
        promotionCheck: greenPromotion,
        attributionCheck: {
          name: ATTRIBUTION_CHECK_NAME,
          status: "completed",
          conclusion: "success",
        },
      }),
    );

    expect(summary).toContain("eu-nis2-cra");
    expect(summary).toMatch(/Legal space/i);
  });

  it("includes capsule hash and HPURL with space when legal space is set", () => {
    const summary = renderTrustSummary(
      baseCtx({
        legalSpace: "us-baseline",
        attributionCheck: {
          name: ATTRIBUTION_CHECK_NAME,
          status: "completed",
          conclusion: "success",
        },
      }),
    );

    expect(summary).toContain("capsuledeadbeef");
    expect(summary).toContain("https://example.test/proof");
    expect(summary).toContain("space=us-baseline");
  });

  it("exports a comment marker for upsert", () => {
    expect(trustSummaryCommentMarker).toContain("vibe-engine-os-trust-summary");
  });
});
