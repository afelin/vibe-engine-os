import * as fs from "node:fs";
import * as path from "node:path";
import type { HealResult, TroubleshootPacket } from "../constitution/catalog.js";
import { parseHealResult } from "../constitution/parse.js";
import {
  readGateFeedbackEntry,
  seedGateFeedbackCache,
} from "../memory/feedback-cache.js";
import { recallLessons } from "../memory/recall.js";
import { resolveCriticEndpoint, type CriticEndpoint } from "../llm/router.js";
import { getVibeDepth, healMaxLevelForDepth } from "../os/depth.js";
import { evaluateMandates, loadMandates } from "../policy/evaluate.js";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";
import { classifyProblem, domainToAgentSlot } from "./classify.js";
import { classifyFromSymptom } from "./diagnose.js";
import { runTroubleshootDiagnostics } from "./npm-diagnostics.js";
import { routeExternalAgent, type AgentSlotId } from "./registry.js";
import { fenceUntrusted } from "../context/untrusted-fence.js";

/** Caps the heal ladder at L0–L3. Default 3 preserves full ladder. */
export type HealMaxLevel = 0 | 1 | 2 | 3;

export type HealOptions = {
  rootDir?: string;
  /** @deprecated Prefer maxLevel / VIBE_HEAL_MAX_LEVEL. When true, caps at L1. */
  skipLlm?: boolean;
  /** Hard cap on heal ladder (0|1|2|3). Overrides skipLlm when set. */
  maxLevel?: HealMaxLevel;
  skipDiagnostics?: boolean;
  trustCheck?: () => void;
  /** Test seam: override critic pass. Return true = PASS. */
  criticPass?: (recommendation: string) => Promise<boolean>;
};

export function parseHealMaxLevel(raw: string | undefined): HealMaxLevel | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return undefined;
}

/**
 * Requested heal dial before depth composition:
 * explicit option > VIBE_HEAL_MAX_LEVEL > skipLlm→1 > 3.
 */
export function resolveRequestedHealMaxLevel(
  options: HealOptions = {},
): HealMaxLevel {
  if (options.maxLevel !== undefined) return options.maxLevel;
  const fromEnv = parseHealMaxLevel(process.env.VIBE_HEAL_MAX_LEVEL);
  if (fromEnv !== undefined) return fromEnv;
  if (options.skipLlm) return 1;
  return 3;
}

/**
 * Resolve heal dial: requested cap composed with VIBE_DEPTH
 * (take the more restrictive). Depth 0–1 → max L1; L2 needs depth ≥ 2.
 */
export function resolveHealMaxLevel(options: HealOptions = {}): HealMaxLevel {
  const requested = resolveRequestedHealMaxLevel(options);
  const depthCap = healMaxLevelForDepth(getVibeDepth());
  return Math.min(requested, depthCap) as HealMaxLevel;
}

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

/** One MCP validate_bond call → remediation text when invalid. */
export function remediationFromValidateBond(
  rootDir: string,
  packet: TroubleshootPacket,
): string | undefined {
  const issueBody = packet.body?.trim() || packet.symptom;
  if (!issueBody) return undefined;

  try {
    const text = callReleaseGateTool("validate_bond", {
      root_dir: rootDir,
      issue_body: issueBody,
    });
    const parsed = JSON.parse(text) as {
      valid?: boolean;
      errors?: string[];
      next_action?: string;
      message?: string;
    };
    if (parsed.valid) return undefined;

    const parts: string[] = [];
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      parts.push(parsed.errors.join("; "));
    }
    if (parsed.next_action) parts.push(parsed.next_action);
    if (parsed.message) parts.push(parsed.message);
    const joined = parts.filter(Boolean).join(" — ").trim();
    return joined || text.slice(0, 500);
  } catch (error: unknown) {
    return error instanceof Error
      ? `validate_bond error: ${error.message}`
      : "validate_bond error";
  }
}

async function callCriticVerdict(
  critic: CriticEndpoint,
  recommendation: string,
): Promise<string> {
  const system =
    "You are a Judea Pearl Causal Critic for Coreward heal recommendations. " +
    "If the recommendation is safe and actionable, reply EXACTLY 'PASS'. " +
    "If it fails, explain why in one short paragraph.";
  const user =
    `Review this heal recommendation:\n\n` +
    fenceUntrusted("heal.recommendation", recommendation);

  if (critic.kind === "off") return "PASS";

  if (critic.kind === "openai") {
    const res = await fetch(`${critic.endpoint.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${critic.endpoint.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: critic.endpoint.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 256,
      }),
    });
    if (!res.ok) throw new Error(`critic_http_${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": critic.apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: { text: system } },
      contents: [{ parts: [{ text: user }] }],
    }),
  });
  if (!res.ok) throw new Error(`critic_http_${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

/** One critic pass; true = PASS. Critic off counts as pass. Fail → escalate (no retry). */
export async function runHealCriticPass(
  recommendation: string,
  options: HealOptions = {},
): Promise<{ pass: boolean; detail?: string }> {
  if (options.criticPass) {
    const pass = await options.criticPass(recommendation);
    return { pass, detail: pass ? undefined : "critic_rejected" };
  }

  let critic: CriticEndpoint;
  try {
    critic = resolveCriticEndpoint();
  } catch (error: unknown) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : "critic_resolve_failed",
    };
  }

  if (critic.kind === "off") return { pass: true };

  try {
    const verdict = await callCriticVerdict(critic, recommendation);
    if (verdict.toUpperCase().includes("PASS")) return { pass: true };
    return { pass: false, detail: verdict.slice(0, 500) || "critic_rejected" };
  } catch (error: unknown) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : "critic_call_failed",
    };
  }
}

export async function diagnoseAndHeal(
  packetInput: TroubleshootPacket,
  options: HealOptions = {},
): Promise<HealResult> {
  const rootDir = options.rootDir ?? resolveRootDir(packetInput);
  const maxLevel = resolveHealMaxLevel(options);
  const packet: TroubleshootPacket = {
    ...packetInput,
    rootDir,
    title: packetInput.title || packetInput.symptom,
  };

  seedGateFeedbackCache(rootDir);
  const symptomClass = classifyFromSymptom(packet.symptom);

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
        outcome: "healed",
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
      outcome: apply.reason === "patch_requires_approval" ? "approval_required" : "escalated",
      level: 0,
      healLevel: 0,
      deterministicFix: true,
      agentSlot: "resolve_gate",
      patch: gate.files,
      reason: apply.reason,
    });
  }

  // L0: bond-class → one validate_bond MCP pass (before L1 cache)
  if (symptomClass.failureClass === "bond") {
    const bondRemediation = remediationFromValidateBond(rootDir, packet);
    if (bondRemediation) {
      return parseHealResult({
        healed: false,
        outcome: "escalated",
        level: 0,
        healLevel: 0,
        deterministicFix: true,
        agentSlot: "validate_bond",
        remediation: bondRemediation,
        reason: "bond_validate_failed",
      });
    }
  }

  // L1: cached remediation (guidance delivered — not a hard failure)
  if (maxLevel >= 1) {
    const gateId = packet.gateId ?? gate.gateId ?? symptomClass.gateId;
    if (gateId) {
      const cached = readGateFeedbackEntry(rootDir, gateId);
      if (cached) {
        return parseHealResult({
          healed: true,
          outcome: "guidance_delivered",
          level: 1,
          healLevel: 1,
          deterministicFix: true,
          agentSlot: "feedback-cache",
          remediation: cached.remediation_instruction,
          reason: "guidance_delivered",
        });
      }
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
      const failureClass = failedDiag.classification.failureClass;

      if (failureClass === "bond") {
        const bondRemediation = remediationFromValidateBond(rootDir, packet);
        if (bondRemediation) {
          return parseHealResult({
            healed: false,
            outcome: "escalated",
            level: 0,
            healLevel: 0,
            deterministicFix: true,
            agentSlot: "validate_bond",
            reason: failedDiag.classification.summary,
            remediation: bondRemediation,
          });
        }
      }

      if (failureClass !== "unknown" && maxLevel < 2) {
        const cachedRemediation = symptomClass.gateId
          ? readGateFeedbackEntry(rootDir, symptomClass.gateId)
              ?.remediation_instruction
          : undefined;
        const remediation =
          [failedDiag.remediation, cachedRemediation]
            .filter(Boolean)
            .join("\n") || undefined;
        return parseHealResult({
          healed: false,
          outcome: "escalated",
          level: 0,
          healLevel: 0,
          deterministicFix: true,
          agentSlot: failedDiag.script,
          reason: failedDiag.classification.summary,
          remediation,
        });
      }
    }
  }


  // L0: lesson recall (direct library — not MCP)
  const prefixes = packet.pathPrefixes ?? ["src/"];
  const lessons = recallLessons(rootDir, prefixes, 3);
  if (lessons.lessons.length > 0) {
    return parseHealResult({
      healed: false,
      outcome: "guidance_delivered",
      level: 0,
      healLevel: 0,
      deterministicFix: true,
      agentSlot: "recall_lessons",
      hints: lessons.lessons.map((l) => l.fix),
      remediation: lessons.markdown.slice(0, 500),
      reason: "lessons_recalled",
    });
  }

  if (maxLevel < 2) {
    return parseHealResult({
      healed: false,
      outcome: "escalated",
      level: 3,
      healLevel: 3,
      agentSlot: "human",
      reason: maxLevel < 1 ? "max_level_capped" : "llm_skipped",
    });
  }

  // L2: one bounded LLM pass
  try {
    options.trustCheck?.();
  } catch (error: unknown) {
    return parseHealResult({
      healed: false,
      outcome: "escalated",
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
      outcome: "escalated",
      level: 3,
      healLevel: 3,
      agentSlot: "m365-guide",
      remediation: agentResult.promptBlock,
      reason: `Open BizChat: ${agentResult.bizChatUrl}`,
    });
  }

  const agent = agentResult as import("./types.js").AgentResult;

  if (agent.ok && agent.recommendation && maxLevel >= 2) {
    const critic = await runHealCriticPass(agent.recommendation, options);
    if (!critic.pass) {
      // Fail → escalate L3 once (no retry spiral)
      return parseHealResult({
        healed: false,
        outcome: "escalated",
        level: 3,
        healLevel: 3,
        agentSlot: "human",
        remediation: agent.recommendation,
        reason: critic.detail ?? "critic_rejected",
        tokensSpent: 1,
      });
    }

    return parseHealResult({
      healed: false,
      outcome: "guidance_delivered",
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
    outcome: "escalated",
    level: 3,
    healLevel: 3,
    agentSlot: "human",
    reason: agent.reason ?? "escalate_to_human",
  });
}
