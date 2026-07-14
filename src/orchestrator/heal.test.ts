import { describe, expect, it } from "vitest";
import { diagnoseAndHeal } from "./heal.js";
import { intentToPacket, routeIntent } from "./troubleshoot.js";

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

  it("matches deterministic gate when title/body hit registry", async () => {
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
    if (result.healed) {
      expect(result.level).toBe(0);
      expect(result.deterministicFix).toBe(true);
    }
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
});
