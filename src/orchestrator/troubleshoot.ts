import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HealResult, OrchestratorIntent, TroubleshootPacket } from "../constitution/catalog.js";
import { buildProofHpurl } from "../constitution/hpurl.js";
import { computeVowsHash } from "../constitution/vows.js";
import {
  parseOrchestratorIntent,
  parseTroubleshootPacket,
} from "../constitution/parse.js";
import { readGateFeedbackEntry, seedGateFeedbackCache } from "../memory/feedback-cache.js";
import { recallLessons } from "../memory/recall.js";
import { renderCockpitComment } from "../operator/cockpit.js";
import { appendOsEvent } from "../os/replay.js";
import type { OSContext } from "../os/events.js";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";
import { classifyProblem, domainToAgentSlot } from "./classify.js";
import { classifyFromSymptom } from "./diagnose.js";
import { diagnoseAndHeal } from "./heal.js";
import { runTroubleshootDiagnostics } from "./npm-diagnostics.js";
import { listDetectedAgents } from "./registry.js";

export type TroubleshootOptions = {
  rootDir?: string;
  runId?: string;
  actor?: string;
  skipLlm?: boolean;
  trustCheck?: () => void;
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

function buildMinimalContext(symptom: string): OSContext {
  return {
    issueNumber: "0",
    issueTitle: "Troubleshoot",
    issueBody: symptom,
    attempts: 0,
    maxAttempts: 1,
    findings: [],
    generatedFiles: [],
    verificationResults: [],
    failures: [],
  };
}

function buildHpurlReceipt(rootDir: string, runId: string): string | undefined {
  try {
    const vowsHash = computeVowsHash(rootDir);
    const capsuleHash = crypto
      .createHash("sha256")
      .update(runId + vowsHash)
      .digest("hex");
    return buildProofHpurl(
      process.env.VIBE_PROOF_BASE ?? "https://afelin.github.io/vibe-engine-os/proof",
      { runId, capsuleHash, vowsHash },
    );
  } catch {
    return undefined;
  }
}

function renderTroubleshootCockpit(
  heal: HealResult,
  packet: TroubleshootPacket,
  rootDir: string,
  hpurl?: string,
): string {
  const lines = [
    "## Troubleshoot result",
    "",
    `**Symptom:** ${packet.symptom}`,
    `**Heal level:** L${heal.healLevel ?? heal.level}`,
    `**Agent slot:** ${heal.agentSlot ?? "none"}`,
    `**Deterministic:** ${heal.deterministicFix ? "yes" : "no"}`,
    `**Healed:** ${heal.healed ? "yes" : "no"}`,
  ];

  if (heal.remediation) {
    lines.push("", "### Remediation", "", heal.remediation);
  }
  if (heal.hints?.length) {
    lines.push("", "### Prior lessons", "", ...heal.hints.map((h: string) => `- ${h}`));
  }
  if (heal.reason) {
    lines.push("", `**Next step:** ${heal.reason}`);
  }
  if (hpurl) {
    lines.push("", `[View proof](${hpurl})`);
  }

  lines.push(
    "",
    renderCockpitComment(
      heal.healed ? "completed" : "failed",
      buildMinimalContext(packet.symptom),
      rootDir,
    ),
  );

  return lines.join("\n");
}

export async function runTroubleshootDag(
  packetInput: TroubleshootPacket,
  options: TroubleshootOptions = {},
): Promise<TroubleshootOutcome> {
  const rootDir = options.rootDir ?? packetInput.rootDir ?? ".";
  const packet = parseTroubleshootPacket({ ...packetInput, rootDir });
  const runId = options.runId ?? packet.runId ?? synthesizeRunId(packet.symptom);

  appendOsEvent(rootDir, runId, {
    type: "troubleshoot.requested",
    protocolVersion: "os.orchestrator.v1",
    actor: options.actor ?? "cli",
    symptom: packet.symptom,
    domain: packet.domain,
  });

  // Step 1: resolve_gate (also inside heal, but explicit for DAG trace)
  callReleaseGateTool("resolve_gate", {
    title: packet.title,
    body: packet.body ?? packet.symptom,
  });

  // Step 2: feedback cache (seed defaults idempotently for L1 hits)
  seedGateFeedbackCache(rootDir);
  const cacheGateId = packet.gateId ?? classifyFromSymptom(packet.symptom).gateId;
  if (cacheGateId) {
    readGateFeedbackEntry(rootDir, cacheGateId);
  }

  // Step 3: build_scoped_context when bound files present
  if (packet.boundFiles?.length) {
    callReleaseGateTool("build_scoped_context", {
      root_dir: rootDir,
      bond_files: packet.boundFiles,
    });
  }

  // Step 4-5: npm diagnostics verify
  runTroubleshootDiagnostics(rootDir, {
    runId: packet.runId,
    symptom: packet.symptom,
  });

  // Step 6: validate_capsule when run id present
  if (packet.runId) {
    callReleaseGateTool("validate_capsule", {
      root_dir: rootDir,
      run_id: packet.runId,
    });
  }

  // Step 7: recall lessons
  recallLessons(rootDir, packet.pathPrefixes ?? ["src/"], 3);

  // Heal ladder (L0-L3)
  const heal = await diagnoseAndHeal(packet, {
    rootDir,
    skipLlm: options.skipLlm,
    trustCheck: options.trustCheck,
  });

  const hpurl = buildHpurlReceipt(rootDir, runId);
  const cockpit = renderTroubleshootCockpit(heal, packet, rootDir, hpurl);

  appendOsEvent(rootDir, runId, {
    type: "troubleshoot.completed",
    protocolVersion: "os.orchestrator.v1",
    actor: options.actor ?? "cli",
    healLevel: heal.healLevel ?? heal.level,
    agentSlot: heal.agentSlot,
    deterministicFix: heal.deterministicFix ?? false,
    healed: heal.healed,
  });

  return { packet, heal, cockpit, hpurl, runId };
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
