import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatStakeholderNarrativesSection,
  renderStakeholderNarratives,
  stakeholderNarrativesCommentMarker,
  type StakeholderNarrativesManifest,
} from "./stakeholder-narratives.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-stakeholder-"));
  tempDirs.push(dir);
  return dir;
}

function fixtureManifest(
  overrides: Partial<StakeholderNarrativesManifest> = {},
): StakeholderNarrativesManifest {
  return {
    runId: "run-fixture-1",
    issueNumber: "42",
    issueTitle: "Ship stakeholder narratives",
    capsuleHash: "abc123capsule",
    vowsHash: "def456vows",
    approvalRequired: false,
    success: true,
    state: "completed",
    metrics: {
      attempts: 1,
      firstPassGreen: true,
      gateIdsFailed: [],
      durationMs: 1200,
      healLevel: 0,
      deterministicFix: true,
      healOutcome: "healed",
    },
    ...overrides,
  };
}

describe("renderStakeholderNarratives", () => {
  it("returns three non-empty snippets with expected keywords from fixture manifest", () => {
    const snippets = renderStakeholderNarratives(fixtureManifest());

    expect(snippets.ops.length).toBeGreaterThan(0);
    expect(snippets.compliance.length).toBeGreaterThan(0);
    expect(snippets.investor.length).toBeGreaterThan(0);

    expect(snippets.ops).toMatch(/ops|run|heal|attempt/i);
    expect(snippets.ops).toContain("run-fixture-1");
    expect(snippets.compliance).toMatch(/compliance|vows|capsule|legal/i);
    expect(snippets.investor).toMatch(/investor|capsule|first.?pass|proof/i);
  });

  it("cites NIS2/CRA regimes when eu-nis2-cra legal space is active", () => {
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

    const snippets = renderStakeholderNarratives(
      fixtureManifest({
        rootDir: root,
        legalSpace: "eu-nis2-cra",
      }),
    );

    expect(snippets.compliance).toContain("NIS2");
    expect(snippets.compliance).toContain("CRA");
    expect(snippets.compliance).toMatch(/eu-nis2-cra|nis2|cra|eu-supplier/i);
  });

  it("formats a markdown section with all three variants", () => {
    const section = formatStakeholderNarrativesSection(
      renderStakeholderNarratives(fixtureManifest({ legalSpace: "none" })),
    );

    expect(section).toContain("### Ops");
    expect(section).toContain("### Compliance");
    expect(section).toContain("### Investor");
    expect(stakeholderNarrativesCommentMarker).toContain(
      "vibe-engine-os-stakeholder-narratives",
    );
  });
});
