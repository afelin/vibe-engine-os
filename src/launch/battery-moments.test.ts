/**
 * Prelaunch battery micromoments + claim-ledger honesty rules.
 * Fixtures: /go (3 actions), trust markers, stackables MCP, CyberReady
 * not_installed, HPURL space=, narrative keywords.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderGoGuide } from "../operator/cockpit.js";
import {
  buildProofHpurl,
  parseProofHpurl,
} from "../constitution/hpurl.js";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";
import { cyberreadyValidateDelta } from "../release-gate/cyberready-bridge.js";
import {
  renderStakeholderNarratives,
  stakeholderNarrativesCommentMarker,
} from "../publishing/stakeholder-narratives.js";
import {
  renderTrustSummary,
  trustSummaryCommentMarker,
} from "../publishing/trust-summary.js";
import {
  buildAndWriteBatteryReport,
  buildBatteryReport,
  CLAIM_CATALOG,
  evaluateAssertResults,
  evaluateClaim,
  hasFailedClaims,
  isUnclaimable,
  quotableClaims,
  UNCLAIMABLE_IDS,
  unclaimableStayUnclaimed,
  visibleBatteryClaims,
  writeBatteryReport,
} from "./claim-ledger.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(prefix = "vibe-battery-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function numberedActions(body: string): string[] {
  return [...body.matchAll(/^\d+\.\s/gm)].map((m) => m[0]);
}

describe("battery moments: /go three actions", () => {
  it("renderGoGuide returns exactly 3 numbered actions (pre-run + active states)", () => {
    const bodies = [
      renderGoGuide({ preRun: true }),
      renderGoGuide({ state: "planning" }),
      renderGoGuide({ state: "awaiting_approval" }),
      renderGoGuide({ state: "completed" }),
      renderGoGuide({ state: "failed" }),
    ];
    for (const body of bodies) {
      expect(numberedActions(body)).toHaveLength(3);
      expect(body).toMatch(/1\.\s+\*\*Blocking:\*\*/);
      expect(body).toMatch(/2\.\s+\*\*Fastest unblock:\*\*/);
      expect(body).toMatch(/3\.\s+\*\*Merge or deploy next:\*\*/);
    }
  });
});

describe("battery moments: trust summary markers", () => {
  it("exports trust summary marker and renders Trust summary heading", () => {
    expect(trustSummaryCommentMarker).toContain("vibe-engine-os-trust-summary");
    const summary = renderTrustSummary({
      state: "completed",
      runId: "run-battery-1",
      capsuleHash: "capsulehashbattery01",
      vowsHash: "vowshashbattery00001",
      repository: "org/repo",
      proofBase: "https://example.test/proof",
      legalSpace: "none",
    });
    expect(summary).toContain("## Trust summary");
    expect(summary).toMatch(/Capsule|HPURL|Next action/i);
  });
});

describe("battery moments: stackables MCP round-trip", () => {
  it("set_legal_space → get_active_stack round-trips none", () => {
    const root = tempRoot("vibe-battery-stack-");
    const setText = callReleaseGateTool("set_legal_space", {
      root_dir: root,
      legal_space: "none",
    });
    const setParsed = JSON.parse(setText) as {
      ok: boolean;
      stack: { legalSpace: string };
    };
    expect(setParsed.ok).toBe(true);
    expect(setParsed.stack.legalSpace).toBe("none");

    const getText = callReleaseGateTool("get_active_stack", {
      root_dir: root,
    });
    const getParsed = JSON.parse(getText) as {
      ok: boolean;
      stack: { legalSpace: string } | null;
    };
    expect(getParsed.ok).toBe(true);
    expect(getParsed.stack?.legalSpace).toBe("none");
  });
});

describe("battery moments: CyberReady not_installed", () => {
  it("cyberreadyValidateDelta returns not_installed without sock (fail-open)", () => {
    const prev = process.env.CYBERREADY_SOCK;
    delete process.env.CYBERREADY_SOCK;
    try {
      const result = cyberreadyValidateDelta({});
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("not_installed");

      const mcpText = callReleaseGateTool("cyberready_validate_delta", {});
      const mcp = JSON.parse(mcpText) as { ok: boolean; reason?: string };
      expect(mcp.ok).toBe(false);
      expect(mcp.reason).toBe("not_installed");
    } finally {
      if (prev === undefined) {
        delete process.env.CYBERREADY_SOCK;
      } else {
        process.env.CYBERREADY_SOCK = prev;
      }
    }
  });
});

describe("battery moments: HPURL space=", () => {
  it("round-trips space= legal-space param", () => {
    const url = buildProofHpurl("https://example.test/proof", {
      runId: "run-space-1",
      capsuleHash: "a".repeat(64),
      vowsHash: "b".repeat(64),
      space: "eu-nis2-cra",
    });
    expect(url).toContain("space=eu-nis2-cra");
    const parsed = parseProofHpurl(url);
    expect(parsed?.space).toBe("eu-nis2-cra");
  });
});

describe("battery moments: narrative keywords", () => {
  it("stakeholder narratives include ops / compliance / investor keywords", () => {
    const snippets = renderStakeholderNarratives({
      runId: "run-narrative-battery",
      issueNumber: "7",
      issueTitle: "Battery narrative fixture",
      capsuleHash: "capnarr01",
      vowsHash: "vownarr01",
      success: true,
      state: "completed",
      legalSpace: "none",
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        healLevel: 0,
        deterministicFix: true,
      },
    });

    expect(snippets.ops).toMatch(/ops|run|heal/i);
    expect(snippets.compliance).toMatch(/compliance|vows|capsule/i);
    expect(snippets.investor).toMatch(/investor|capsule|first.?pass|proof/i);
    expect(stakeholderNarrativesCommentMarker).toContain(
      "vibe-engine-os-stakeholder-narratives",
    );
  });
});

describe("claim ledger rules", () => {
  it("catalog keeps hosted_hpurl and cyberready_live assert null", () => {
    for (const id of UNCLAIMABLE_IDS) {
      expect(isUnclaimable(id)).toBe(true);
      const def = CLAIM_CATALOG.find((c) => c.id === id);
      expect(def).toBeDefined();
      expect(def!.assert).toBeNull();
    }
  });

  it("savings_attestation_local maps to savings_attest assert", () => {
    const def = CLAIM_CATALOG.find((c) => c.id === "savings_attestation_local");
    expect(def?.assert).toBe("savings_attest");
    expect(evaluateClaim(def!, { savings_attest: true }).status).toBe("pass");
    expect(evaluateClaim(def!, {}).status).toBe("not_run");
  });

  it("unclaimable claims stay unbuilt even if assertResults try to pass them", () => {
    const poisoned = evaluateAssertResults({
      hosted_hpurl: true,
      cyberready_live: true,
      eval_bond: true,
    });
    const hosted = poisoned.find((c) => c.id === "hosted_hpurl");
    const live = poisoned.find((c) => c.id === "cyberready_live");
    expect(hosted?.status).toBe("unbuilt");
    expect(hosted?.assert).toBeNull();
    expect(live?.status).toBe("unbuilt");
    expect(live?.assert).toBeNull();
    expect(unclaimableStayUnclaimed(poisoned)).toBe(true);
  });

  it("evaluateClaim: true → pass, false → fail, missing → not_run; null assert → unbuilt", () => {
    const def = {
      id: "gauntlet_blocks_forbidden",
      text: "Forbidden paths are rejected",
      assert: "eval_bond",
    };
    expect(evaluateClaim(def, { eval_bond: true }).status).toBe("pass");
    expect(evaluateClaim(def, { eval_bond: false }).status).toBe("fail");
    expect(evaluateClaim(def, {}).status).toBe("not_run");
    expect(
      evaluateClaim(
        { id: "hosted_hpurl", text: "x", assert: null },
        {},
      ).status,
    ).toBe("unbuilt");
  });

  it("visibleBatteryClaims hides unbuilt stubs", () => {
    const claims = evaluateAssertResults({ eval_bond: true });
    const visible = visibleBatteryClaims(claims);
    expect(visible.every((c) => c.status !== "unbuilt")).toBe(true);
    expect(visible.some((c) => c.id === "hosted_hpurl")).toBe(false);
  });

  it("quotableClaims only returns pass; hasFailedClaims detects fails", () => {
    const claims = evaluateAssertResults({
      eval_bond: true,
      check: false,
      battery_moments: true,
    });
    const quoted = quotableClaims(claims);
    expect(quoted.every((c) => c.status === "pass")).toBe(true);
    expect(quoted.some((c) => c.id === "gauntlet_blocks_forbidden")).toBe(true);
    expect(hasFailedClaims(claims)).toBe(true);
  });

  it("buildBatteryReport + writeBatteryReport produce scoreboard JSON", () => {
    const root = tempRoot("vibe-battery-ledger-");
    const report = buildBatteryReport({
      mode: "fast",
      elapsedMs: 1234,
      assertResults: {
        check: true,
        eval_bond: true,
        battery_moments: true,
        mcp_stackables_smoke: true,
        cyberready_soft: true,
      },
      funnel: { bootstrapMs: 50, goGuideActions: 3 },
    });

    expect(report.mode).toBe("fast");
    expect(report.elapsedMs).toBe(1234);
    expect(report.funnel.goGuideActions).toBe(3);
    expect(report.killers.K5).toBe("pass");
    expect(report.killers.K8).toBe("pass");
    expect(report.killers.K13).toBe("soft");
    expect(unclaimableStayUnclaimed(report.claims)).toBe(true);

    const out = writeBatteryReport(root, report);
    expect(out).toContain("battery-prelaunch.json");
    const loaded = JSON.parse(fs.readFileSync(out, "utf8")) as typeof report;
    expect(loaded.claims.find((c) => c.id === "hosted_hpurl")?.status).toBe(
      "unbuilt",
    );
    expect(loaded.claims.find((c) => c.id === "cyberready_live")?.status).toBe(
      "unbuilt",
    );

    const written = buildAndWriteBatteryReport(root, {
      mode: "full",
      elapsedMs: 99,
      assertResults: { check: true, eval_bond: true },
    });
    expect(written.report.mode).toBe("full");
    expect(fs.existsSync(written.path)).toBe(true);
  });
});
