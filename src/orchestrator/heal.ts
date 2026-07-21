import * as fs from "node:fs";
import * as path from "node:path";
import type { HealResult, TroubleshootPacket } from "../constitution/catalog.js";
import { parseHealResult } from "../constitution/parse.js";
import {
  readGateFeedbackEntry,
  seedGateFeedbackCache,
} from "../memory/feedback-cache.js";
import { recallLessons } from "../memory/recall.js";
import { evaluateMandates, loadMandates } from "../policy/evaluate.js";
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

function touchesConstitution(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized === "VOWS.md" ||
    normalized.endsWith("/VOWS.md") ||
    normalized.endsWith("mandates.json") ||
    normalized.endsWith("gates.json") ||
    normalized.includes("/src/policy/") ||
    normalized.startsWith("src/policy/")
  );
}

/**
 * Apply L0 gate patch only when every path is inside the TaskBond and
 * passes mandate checks. Never writes mandates/gates/VOWS.
 */
export function applyGatePatchUnderBond(
  rootDir: string,
  files: Record<string, string>,
  boundFiles?: string[],
): { applied: boolean; reason: string } {
  const paths = Object.keys(files);
  if (paths.length === 0) {
    return { applied: false, reason: "empty_patch" };
  }

  if (paths.some(touchesConstitution)) {
    return { applied: false, reason: "patch_touches_constitution" };
  }

  const mandateEval = evaluateMandates(paths, loadMandates(rootDir));
  if (!mandateEval.passed) {
    return { applied: false, reason: "patch_blocked_by_mandate" };
  }
  if (mandateEval.requiresApproval) {
    return { applied: false, reason: "patch_requires_approval" };
  }

  if (!boundFiles?.length) {
    return { applied: false, reason: "patch_proposed_no_bond" };
  }

  const bondSet = new Set(boundFiles.map((f) => f.replace(/\\/g, "/")));
  const outside = paths.filter((p) => !bondSet.has(p.replace(/\\/g, "/")));
  if (outside.length > 0) {
    return { applied: false, reason: "patch_outside_bond" };
  }

  for (const [relPath, content] of Object.entries(files)) {
    const filepath = path.join(rootDir, relPath);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, content, "utf8");
  }

  return { applied: true, reason: "patched" };
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

  seedGateFeedbackCache(rootDir);

  // L0: deterministic gate match — apply under bond or propose only
  const gate = parseGateResolve(packet.title, packet.body ?? packet.symptom);
  if (gate.matched && gate.files) {
    const apply = applyGatePatchUnderBond(
      rootDir,
      gate.files,
      packet.boundFiles,
    );
    if (apply.applied) {
      return parseHealResult({
        healed: true,
        level: 0,
        healLevel: 0,
        deterministicFix: true,
        agentSlot: "resolve_gate",
        patch: gate.files,
        reason: "patched",
      });
    }
    return parseHealResult({
      healed: false,
      level: 0,
      healLevel: 0,
      deterministicFix: true,
      agentSlot: "resolve_gate",
      patch: gate.files,
      reason: apply.reason,
    });
  }

  // L1: cached remediation (guidance delivered — not a hard failure)
  const symptomGateId = classifyFromSymptom(packet.symptom).gateId;
  const gateId = packet.gateId ?? gate.gateId ?? symptomGateId;
  if (gateId) {
    const cached = readGateFeedbackEntry(rootDir, gateId);
    if (cached) {
      return parseHealResult({
        healed: true,
        level: 1,
        healLevel: 1,
        deterministicFix: true,
        agentSlot: "feedback-cache",
        remediation: cached.remediation_instruction,
        reason: "guidance_delivered",
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
      reason: "lessons_recalled",
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
