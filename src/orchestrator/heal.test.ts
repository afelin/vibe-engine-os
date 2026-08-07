import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedGateFeedbackCache } from "../memory/feedback-cache.js";
import {
  applyGatePatchUnderBond,
  diagnoseAndHeal,
  resolveHealMaxLevel,
} from "./heal.js";
import {
  hpurlFromValidatedCapsule,
  intentToPacket,
  routeIntent,
  runTroubleshootDag,
} from "./troubleshoot.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-heal-"));
  tempDirs.push(dir);
  return dir;
}

describe("orchestrator heal", () => {
  it("returns L0 lesson hints without LLM when lessons exist", async () => {
    const result = await diagnoseAndHeal(
      {
        symptom: "vitest gate failure",
        title: "vitest gate failure",
        trustTier: "experiment",
        pathPrefixes: ["src/constitution/"],
        rootDir: ".",
      },
      { skipLlm: true, skipDiagnostics: true },
    );
    expect(result.level).toBeGreaterThanOrEqual(0);
    expect(result.level).toBeLessThanOrEqual(3);
  });

  it("returns L1 guidance_delivered for promotion gate symptom", async () => {
    seedGateFeedbackCache(".");
    const result = await diagnoseAndHeal(
      {
        symptom: "Vibe Promotion Gate failing",
        title: "Vibe Promotion Gate failing",
        trustTier: "experiment",
        rootDir: ".",
      },
      { skipLlm: true, skipDiagnostics: true },
    );
    expect(result.level).toBe(1);
    expect(result.healed).toBe(true);
    expect(result.reason).toBe("guidance_delivered");
    expect(result.outcome).toBe("guidance_delivered");
    expect(result.agentSlot).toBe("feedback-cache");
    expect(result.remediation).toContain("bond:preflight");
  });

  it("proposes L0 gate patch without claiming healed when no bond", async () => {
    const result = await diagnoseAndHeal(
      {
        symptom: "add unit test",
        title: "Release gate: add unit test",
        body: "src/example.ts src/example.test.ts",
        trustTier: "experiment",
        rootDir: ".",
      },
      { skipLlm: true, skipDiagnostics: true },
    );
    if (result.patch) {
      expect(result.healed).toBe(false);
      expect(result.level).toBe(0);
      expect(result.deterministicFix).toBe(true);
      expect(result.reason).toMatch(/bond|proposed/);
    }
  });

  it("applies L0 patch under TaskBond and marks patched", () => {
    const root = makeTempRoot();
    const files = {
      "src/example.ts": "export const x = 1;\n",
      "src/example.test.ts": 'import { describe, it } from "vitest";\n',
    };
    const apply = applyGatePatchUnderBond(root, files, Object.keys(files));
    expect(apply.applied).toBe(true);
    expect(fs.readFileSync(path.join(root, "src/example.ts"), "utf8")).toContain(
      "export const x",
    );
  });

  it("refuses patches that touch constitution paths", () => {
    const root = makeTempRoot();
    const apply = applyGatePatchUnderBond(
      root,
      { "VOWS.md": "hacked\n" },
      ["VOWS.md"],
    );
    expect(apply.applied).toBe(false);
    expect(apply.reason).toBe("patch_touches_constitution");
  });
});

describe("orchestrator troubleshoot routing", () => {
  it("maps M365 intent to m365-guide slot", () => {
    const routed = routeIntent(
      { action: "route", symptom: "Microsoft Teams webhook error" },
      ".",
    );
    expect(routed.domain).toBe("m365");
    expect(routed.agentSlot).toBe("m365-guide");
  });

  it("builds troubleshoot packet from intent", () => {
    const packet = intentToPacket(
      { action: "troubleshoot", symptom: "bond preflight failed" },
      ".",
    );
    expect(packet.symptom).toBe("bond preflight failed");
    expect(packet.trustTier).toBeDefined();
  });

  it("omits synthetic HPURL when capsule is not validated", () => {
    expect(hpurlFromValidatedCapsule(".", "troubleshoot-deadbeef")).toBeUndefined();
    expect(hpurlFromValidatedCapsule(".", undefined)).toBeUndefined();
  });

  it("appends scoreboard on troubleshoot.completed", async () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, ".runs"), { recursive: true });
    seedGateFeedbackCache(root);

    const packet = intentToPacket(
      {
        action: "troubleshoot",
        symptom: "Vibe Promotion Gate failing",
        title: "Vibe Promotion Gate failing",
      },
      root,
    );
    const outcome = await runTroubleshootDag(packet, {
      rootDir: root,
      skipLlm: true,
      actor: "test",
    });

    expect(outcome.hpurl).toBeUndefined();
    expect(outcome.heal.reason).toBe("guidance_delivered");
    expect(outcome.heal.outcome).toBe("guidance_delivered");
    expect(outcome.cockpit).toContain("### Next step");
    expect(outcome.cockpit).not.toContain("## Coreward");
    // legacy heading also absent
    expect(outcome.cockpit).not.toContain("## Vibe Engine OS");
    const scoreboard = fs.readFileSync(
      path.join(root, ".runs", "scoreboard.ndjson"),
      "utf8",
    );
    expect(scoreboard).toContain("healLevel");
    expect(scoreboard).toContain("feedback-cache");
    expect(scoreboard).toContain("\"healOutcome\":\"guidance_delivered\"");

    const interventions = fs.readFileSync(
      path.join(root, ".runs", "interventions.ndjson"),
      "utf8",
    );
    expect(interventions).toContain("promotion_gate");
  });

  it("respects maxLevel 0 by skipping L1 cache hits", async () => {
    seedGateFeedbackCache(".");
    const result = await diagnoseAndHeal(
      {
        symptom: "Vibe Promotion Gate failing",
        title: "Vibe Promotion Gate failing",
        trustTier: "experiment",
        rootDir: ".",
      },
      { maxLevel: 0, skipDiagnostics: true },
    );
    expect(result.reason).not.toBe("guidance_delivered");
    expect(result.outcome).not.toBe("guidance_delivered");
    expect(result.healLevel === 0 || result.healLevel === 3).toBe(true);
  });

  it("resolveHealMaxLevel maps skipLlm to 1 and defaults to 3", () => {
    expect(resolveHealMaxLevel({})).toBe(3);
    expect(resolveHealMaxLevel({ skipLlm: true })).toBe(1);
    expect(resolveHealMaxLevel({ maxLevel: 2, skipLlm: true })).toBe(2);
  });

  it("composes VIBE_DEPTH with maxLevel (more restrictive wins)", () => {
    const prevDepth = process.env.VIBE_DEPTH;
    const prevHeal = process.env.VIBE_HEAL_MAX_LEVEL;
    try {
      process.env.VIBE_DEPTH = "1";
      delete process.env.VIBE_HEAL_MAX_LEVEL;
      expect(resolveHealMaxLevel({})).toBe(1);
      expect(resolveHealMaxLevel({ maxLevel: 3 })).toBe(1);
      expect(resolveHealMaxLevel({ maxLevel: 0 })).toBe(0);

      process.env.VIBE_DEPTH = "3";
      process.env.VIBE_HEAL_MAX_LEVEL = "2";
      expect(resolveHealMaxLevel({})).toBe(2);
    } finally {
      if (prevDepth === undefined) delete process.env.VIBE_DEPTH;
      else process.env.VIBE_DEPTH = prevDepth;
      if (prevHeal === undefined) delete process.env.VIBE_HEAL_MAX_LEVEL;
      else process.env.VIBE_HEAL_MAX_LEVEL = prevHeal;
    }
  });

  it("runHealCriticPass fails closed without retry spiral", async () => {
    const { runHealCriticPass } = await import("./heal.js");
    const rejected = await runHealCriticPass("delete VOWS.md", {
      criticPass: async () => false,
    });
    expect(rejected.pass).toBe(false);
    const accepted = await runHealCriticPass("rerun bond:preflight", {
      criticPass: async () => true,
    });
    expect(accepted.pass).toBe(true);
  });

  it("calls validate_bond remediation on bond-class symptom", async () => {
    const result = await diagnoseAndHeal(
      {
        symptom: "bond: bound file path rejected by mandates",
        title: "bond: bound file path rejected by mandates",
        body: "### Intent\nFix bond\n### Outcome\n- ok\n### Files\n",
        trustTier: "experiment",
        pathPrefixes: ["__no_lessons__/"],
        rootDir: ".",
      },
      { skipLlm: true, skipDiagnostics: true },
    );
    expect(result.agentSlot).toBe("validate_bond");
    expect(result.healLevel).toBe(0);
    expect(result.remediation).toBeTruthy();
  });
});
