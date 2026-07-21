import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HealResult, OrchestratorIntent, TroubleshootPacket } from "../constitution/catalog.js";
import { buildProofHpurl } from "../constitution/hpurl.js";
import {
  parseOrchestratorIntent,
  parseTroubleshootPacket,
} from "../constitution/parse.js";
import { appendOsEvent } from "../os/replay.js";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";
import { appendIntervention } from "../research/interventions.js";
import { appendScoreboardEntry } from "../run/manifest.js";
import { classifyProblem, domainToAgentSlot } from "./classify.js";
import { classifyFromSymptom } from "./diagnose.js";
import {
  diagnoseAndHeal,
  type HealMaxLevel,
  type HealOptions,
} from "./heal.js";
import { listDetectedAgents } from "./registry.js";

export type TroubleshootOptions = {
  rootDir?: string;
  runId?: string;
  actor?: string;
  skipLlm?: boolean;
  maxLevel?: HealMaxLevel;
  trustCheck?: () => void;
  issueNumber?: string;
};

export type TroubleshootOutcome = {
  packet: TroubleshootPacket;
  heal: HealResult;
  cockpit: string;
  hpurl?: string;
  runId: string;
};

function resolveTrustTier(rootDir: string): TroubleshootPacket["trustTier"] {
  const corpMarker = path.join(rootDir, ".vibe", "corp-boundary");
  if (fs.existsSync(corpMarker)) return "corporate";
  return "experiment";
}

function synthesizeRunId(symptom: string): string {
  const hash = crypto.createHash("sha256").update(symptom).digest("hex").slice(0, 8);
  return `troubleshoot-${hash}`;
}

export function intentToPacket(
  intent: OrchestratorIntent,
  rootDir = ".",
): TroubleshootPacket {
  const parsed = parseOrchestratorIntent(intent);
  const domain = parsed.domain ?? classifyProblem(parsed.symptom, parsed.body);
  const symptomGateId = classifyFromSymptom(parsed.symptom).gateId;
  return parseTroubleshootPacket({
    runId: parsed.runId,
    symptom: parsed.symptom,
    title: parsed.title ?? parsed.symptom,
    body: parsed.body,
    gateId: parsed.gateId ?? symptomGateId,
    pathPrefixes: parsed.pathPrefixes,
    boundFiles: parsed.boundFiles,
    trustTier: parsed.trustTier ?? resolveTrustTier(rootDir),
    domain,
    rootDir,
  });
}

/** HPURL only when validate_capsule succeeds for a real sealed run. */
export function hpurlFromValidatedCapsule(
  rootDir: string,
  runId: string | undefined,
): string | undefined {
  if (!runId || runId.startsWith("troubleshoot-")) return undefined;

  try {
    const text = callReleaseGateTool("validate_capsule", {
      root_dir: rootDir,
      run_id: runId,
    });
    const parsed = JSON.parse(text) as {
      valid?: boolean;
      capsuleHash?: string | null;
      vowsHash?: string | null;
    };
    if (!parsed.valid || !parsed.capsuleHash || !parsed.vowsHash) {
      return undefined;
    }
    return buildProofHpurl(
      process.env.VIBE_PROOF_BASE ?? "https://afelin.github.io/vibe-engine-os/proof",
      {
        runId,
        capsuleHash: parsed.capsuleHash,
        vowsHash: parsed.vowsHash,
      },
    );
  } catch {
    return undefined;
  }
}

function nextActionForHeal(heal: HealResult): string {
  if (heal.healed) {
    return heal.reason === "guidance_delivered"
      ? "Apply the remediation above, then `/retry` or re-run the failing gate."
      : "Heal applied. Re-run verification or continue the ship path.";
  }
  if (heal.reason === "patch_requires_approval") {
    return "Protected path — comment `/approve` on this issue to allow the write, then `/retry`.";
  }
  if ((heal.healLevel ?? heal.level) >= 3) {
    return "Escalated to human. Fix manually or comment `/approve` if a protected write is needed, then `/retry`.";
  }
  if (heal.remediation) {
    return "Follow the remediation above, then `/retry`.";
  }
  return "Comment `/status` for a scoreboard snapshot or `/retry` after a fix.";
}

function renderTroubleshootCockpit(
  heal: HealResult,
  packet: TroubleshootPacket,
  hpurl?: string,
): string {
  const level = heal.healLevel ?? heal.level;
  const lines = [
    "## Troubleshoot result",
    "",
    `**Symptom:** ${packet.symptom}`,
    `**Heal level:** L${level}`,
    `**Agent slot:** ${heal.agentSlot ?? "none"}`,
    `**Deterministic:** ${heal.deterministicFix ? "yes" : "no"}`,
    `**Healed:** ${heal.healed ? "yes" : "no"}`,
  ];

  if (heal.reason) {
    lines.push("", `**Outcome:** ${heal.reason}`);
  }
  if (heal.remediation) {
    lines.push("", "### Remediation", "", heal.remediation);
  }
  if (heal.hints?.length) {
    lines.push("", "### Prior lessons", "", ...heal.hints.map((h: string) => `- ${h}`));
  }
  if (heal.reason === "patch_requires_approval") {
    lines.push(
      "",
      "### Approval required",
      "",
      "This patch touches a protected path. Comment **`/approve`** to unblock, then **`/retry`**.",
    );
  }
  if (hpurl) {
    lines.push("", `[View proof](${hpurl})`);
  }

  lines.push("", "### Next step", nextActionForHeal(heal));
  lines.push(
    "",
    "`/status` · `/approve` · `/retry` · `/troubleshoot <symptom>`",
  );

  return lines.join("\n");
}

/** Record Pearl intervention on L0 patch or L1 guidance win — never constitution paths. */
function recordHealIntervention(
  rootDir: string,
  heal: HealResult,
  packet: TroubleshootPacket,
): void {
  if (!heal.healed) return;
  const level = heal.healLevel ?? heal.level;

  if (level === 0 && heal.patch && heal.reason === "patched") {
    const files = Object.keys(heal.patch).filter(
      (f) =>
        !f.includes("mandates.json") &&
        !f.includes("gates.json") &&
        !f.endsWith("VOWS.md"),
    );
    appendIntervention(rootDir, files);
    return;
  }

  if (level === 1 && heal.reason === "guidance_delivered") {
    const gateId = packet.gateId ?? classifyFromSymptom(packet.symptom).gateId;
    if (gateId) {
      appendIntervention(rootDir, [
        `.vibe/cache/gates/${gateId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`,
      ]);
    }
  }
}

/**
 * Thin wrapper: one heal pass + ledger/scoreboard/cockpit.
 * All L0–L3 work lives in diagnoseAndHeal (no duplicate resolve_gate/diagnostics/recall).
 */
export async function runTroubleshootDag(
  packetInput: TroubleshootPacket,
  options: TroubleshootOptions = {},
): Promise<TroubleshootOutcome> {
  const started = Date.now();
  const rootDir = options.rootDir ?? packetInput.rootDir ?? ".";
  const packet = parseTroubleshootPacket({ ...packetInput, rootDir });
  const ledgerRunId =
    options.runId ?? packet.runId ?? synthesizeRunId(packet.symptom);

  appendOsEvent(rootDir, ledgerRunId, {
    type: "troubleshoot.requested",
    protocolVersion: "os.orchestrator.v1",
    actor: options.actor ?? "cli",
    symptom: packet.symptom,
    domain: packet.domain,
  });

  const healOpts: HealOptions = {
    rootDir,
    skipLlm: options.skipLlm,
    maxLevel: options.maxLevel,
    trustCheck: options.trustCheck,
  };
  const heal = await diagnoseAndHeal(packet, healOpts);

  const capsuleRunId = packet.runId ?? options.runId;
  const hpurl = hpurlFromValidatedCapsule(rootDir, capsuleRunId);
  const cockpit = renderTroubleshootCockpit(heal, packet, hpurl);
  const healLevel = heal.healLevel ?? heal.level;

  appendOsEvent(rootDir, ledgerRunId, {
    type: "troubleshoot.completed",
    protocolVersion: "os.orchestrator.v1",
    actor: options.actor ?? "cli",
    healLevel,
    agentSlot: heal.agentSlot,
    deterministicFix: heal.deterministicFix ?? false,
    healed: heal.healed,
  });

  appendScoreboardEntry(rootDir, {
    runId: ledgerRunId,
    issueNumber: options.issueNumber ?? "0",
    issueTitle: packet.title,
    success: heal.healed,
    state: heal.healed ? "troubleshoot.healed" : "troubleshoot.open",
    createdAt: new Date().toISOString(),
    metrics: {
      attempts: 1,
      firstPassGreen: heal.healed && healLevel <= 1,
      gateIdsFailed: [],
      durationMs: Date.now() - started,
      tokensEstimate: heal.tokensSpent ?? 0,
      healLevel,
      agentSlot: heal.agentSlot,
      deterministicFix: heal.deterministicFix ?? false,
    },
  });

  recordHealIntervention(rootDir, heal, packet);

  return { packet, heal, cockpit, hpurl, runId: ledgerRunId };
}

export function routeIntent(
  intent: OrchestratorIntent,
  rootDir = ".",
): { domain: string; agentSlot: string } {
  const packet = intentToPacket(intent, rootDir);
  const domain = packet.domain ?? classifyProblem(packet.symptom, packet.body);
  const agentSlot = domainToAgentSlot(domain, packet.trustTier);
  return { domain, agentSlot };
}

export { listDetectedAgents };
