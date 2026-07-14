import type { HealResult, TroubleshootPacket } from "../constitution/catalog.js";
import { parseHealResult } from "../constitution/parse.js";
import { readGateFeedbackEntry } from "../memory/feedback-cache.js";
import { recallLessons } from "../memory/recall.js";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";
import { classifyProblem, domainToAgentSlot } from "./classify.js";
import { classifyFromSymptom } from "./diagnose.js";
import { runTroubleshootDiagnostics } from "./npm-diagnostics.js";
import { routeExternalAgent, type AgentSlotId } from "./registry.js";

export type HealOptions = {
  rootDir?: string;
  skipLlm?: boolean;
  skipDiagnostics?: boolean;
  trustCheck?: () => void;
};

function resolveRootDir(packet: TroubleshootPacket): string {
  return packet.rootDir ?? ".";
}

function parseGateResolve(title: string, body: string): {
  matched: boolean;
  files?: Record<string, string>;
  gateId?: string;
} {
  const text = callReleaseGateTool("resolve_gate", { title, body });
  const parsed = JSON.parse(text) as {
    id?: string;
    files?: Array<{ path: string; content: string }>;
  } | null;

  if (!parsed?.id) {
    return { matched: false };
  }

  if (parsed.files?.length) {
    const patch: Record<string, string> = {};
    for (const file of parsed.files) {
      patch[file.path] = file.content;
    }
    return {
      matched: true,
      files: patch,
      gateId: parsed.id,
    };
  }

  return { matched: true, gateId: parsed.id };
}

export async function diagnoseAndHeal(
  packetInput: TroubleshootPacket,
  options: HealOptions = {},
): Promise<HealResult> {
  const rootDir = options.rootDir ?? resolveRootDir(packetInput);
  const packet: TroubleshootPacket = {
    ...packetInput,
    rootDir,
    title: packetInput.title || packetInput.symptom,
  };

  // L0: deterministic gate match
  const gate = parseGateResolve(packet.title, packet.body ?? packet.symptom);
  if (gate.matched && gate.files) {
    return parseHealResult({
      healed: true,
      level: 0,
      healLevel: 0,
      deterministicFix: true,
      agentSlot: "resolve_gate",
      patch: gate.files,
    });
  }

  // L1: cached remediation
  const gateId = packet.gateId ?? gate.gateId;
  if (gateId) {
    const cached = readGateFeedbackEntry(rootDir, gateId);
    if (cached) {
      return parseHealResult({
        healed: false,
        level: 1,
        healLevel: 1,
        deterministicFix: true,
        agentSlot: "feedback-cache",
        remediation: cached.remediation_instruction,
      });
    }
  }

  // L0: npm diagnostics classification
  if (!options.skipDiagnostics) {
    const diagnostics = runTroubleshootDiagnostics(rootDir, {
      runId: packet.runId,
      symptom: packet.symptom,
    });
    const failedDiag = diagnostics.find((d) => !d.ok);
    if (failedDiag?.classification) {
      const symptomClass = classifyFromSymptom(packet.symptom);
      const failureClass = failedDiag.classification.failureClass;
      if (failureClass !== "unknown" && options.skipLlm) {
        return parseHealResult({
          healed: false,
          level: 0,
          healLevel: 0,
          deterministicFix: true,
          agentSlot: failedDiag.script,
          reason: failedDiag.classification.summary,
          remediation: symptomClass.gateId
            ? readGateFeedbackEntry(rootDir, symptomClass.gateId)
                ?.remediation_instruction
            : undefined,
        });
      }
    }
  }

  // L0: lesson recall
  const prefixes = packet.pathPrefixes ?? ["src/"];
  const lessons = recallLessons(rootDir, prefixes, 3);
  if (lessons.lessons.length > 0) {
    return parseHealResult({
      healed: false,
      level: 0,
      healLevel: 0,
      deterministicFix: true,
      agentSlot: "recall_lessons",
      hints: lessons.lessons.map((l) => l.fix),
      remediation: lessons.markdown.slice(0, 500),
    });
  }

  if (options.skipLlm) {
    return parseHealResult({
      healed: false,
      level: 3,
      healLevel: 3,
      agentSlot: "human",
      reason: "llm_skipped",
    });
  }

  // L2: one bounded LLM pass
  try {
    options.trustCheck?.();
  } catch (error: unknown) {
    return parseHealResult({
      healed: false,
      level: 3,
      healLevel: 3,
      agentSlot: "human",
      reason: error instanceof Error ? error.message : "trust_check_failed",
    });
  }

  const domain = packet.domain ?? classifyProblem(packet.symptom, packet.body);
  const slotId = domainToAgentSlot(domain, packet.trustTier) as AgentSlotId;

  let contextBody = packet.body ?? "";
  if (packet.boundFiles?.length) {
    const contextText = callReleaseGateTool("build_scoped_context", {
      root_dir: rootDir,
      bond_files: packet.boundFiles,
    });
    contextBody = `${contextBody}\n\n${contextText}`.slice(0, 12_000);
  }

  const agentResult = await routeExternalAgent(
    slotId,
    { ...packet, body: contextBody },
    rootDir,
  );

  if ("humanStep" in agentResult && agentResult.humanStep) {
    return parseHealResult({
      healed: false,
      level: 3,
      healLevel: 3,
      agentSlot: "m365-guide",
      remediation: agentResult.promptBlock,
      reason: `Open BizChat: ${agentResult.bizChatUrl}`,
    });
  }

  const agent = agentResult as import("./types.js").AgentResult;

  if (agent.ok && agent.recommendation) {
    return parseHealResult({
      healed: false,
      level: 2,
      healLevel: 2,
      agentSlot: slotId,
      remediation: agent.recommendation,
      tokensSpent: 1,
    });
  }

  // L3: escalate
  return parseHealResult({
    healed: false,
    level: 3,
    healLevel: 3,
    agentSlot: "human",
    reason: agent.reason ?? "escalate_to_human",
  });
}
