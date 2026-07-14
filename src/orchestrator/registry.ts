import * as fs from "node:fs";
import * as path from "node:path";
import type { TroubleshootPacket } from "../constitution/catalog.js";
import { parseTroubleshootPacket } from "../constitution/parse.js";
import { resolveCodegenEndpoint } from "../llm/router.js";
import {
  detectCorpClaude,
  invokeCorpClaude,
} from "./primitives/invokeCorpClaude.js";
import { detectHermes, invokeHermes } from "./primitives/invokeHermes.js";
import { invokeM365Guide } from "./primitives/invokeM365Guide.js";

import type { AgentResult, AgentSlotId } from "./types.js";

export type { AgentSlotId, AgentResult } from "./types.js";

export type AgentSlotConfig = {
  id: AgentSlotId;
  enabled: boolean;
  binary?: string;
  trustTier: "corporate" | "experiment" | "human-in-loop";
};

export type AgentsRegistryFile = {
  agents: AgentSlotConfig[];
};

const DEFAULT_AGENTS: AgentSlotConfig[] = [
  { id: "corp-claude", enabled: true, trustTier: "corporate" },
  { id: "m365-guide", enabled: true, trustTier: "human-in-loop" },
  { id: "hermes", enabled: true, binary: "hermes", trustTier: "experiment" },
  { id: "groq-experiment", enabled: true, trustTier: "experiment" },
  { id: "human", enabled: true, trustTier: "human-in-loop" },
];

export function agentsConfigPath(rootDir: string): string {
  return path.join(rootDir, ".vibe", "orchestrator", "agents.json");
}

export function loadAgentsRegistry(rootDir = "."): AgentSlotConfig[] {
  const configPath = agentsConfigPath(rootDir);
  if (!fs.existsSync(configPath)) return DEFAULT_AGENTS;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(configPath, "utf8"),
    ) as AgentsRegistryFile;
    return parsed.agents?.length ? parsed.agents : DEFAULT_AGENTS;
  } catch {
    return DEFAULT_AGENTS;
  }
}

export function isAgentAvailable(slot: AgentSlotConfig): boolean {
  if (!slot.enabled) return false;
  switch (slot.id) {
    case "corp-claude":
      return detectCorpClaude();
    case "m365-guide":
      return true;
    case "hermes":
      return detectHermes(slot.binary ?? "hermes");
    case "groq-experiment": {
      try {
        return resolveCodegenEndpoint() !== "off";
      } catch {
        return false;
      }
    }
    case "human":
      return true;
    default:
      return false;
  }
}

export function listDetectedAgents(rootDir = "."): Array<{
  id: AgentSlotId;
  enabled: boolean;
  available: boolean;
  trustTier: AgentSlotConfig["trustTier"];
}> {
  return loadAgentsRegistry(rootDir).map((slot) => ({
    id: slot.id,
    enabled: slot.enabled,
    available: isAgentAvailable(slot),
    trustTier: slot.trustTier,
  }));
}

export async function routeExternalAgent(
  slotId: AgentSlotId,
  packetInput: TroubleshootPacket,
  rootDir = ".",
): Promise<AgentResult | { ok: true; agentSlot: "m365-guide"; humanStep: true; bizChatUrl: string; promptBlock: string }> {
  const packet = parseTroubleshootPacket(packetInput);
  const registry = loadAgentsRegistry(rootDir);
  const slot = registry.find((entry) => entry.id === slotId);

  if (!slot?.enabled) {
    return {
      ok: false,
      agentSlot: slotId,
      reason: `agent_disabled:${slotId}`,
    };
  }

  switch (slotId) {
    case "corp-claude":
      return invokeCorpClaude(packet);
    case "m365-guide": {
      const guide = await invokeM365Guide({
        symptom: packet.symptom,
        context: packet.body ?? packet.title,
      });
      return { ok: true, ...guide };
    }
    case "hermes":
      return invokeHermes(packet, slot.binary ?? "hermes");
    case "groq-experiment":
      return invokeGroqExperiment(packet);
    case "human":
      return {
        ok: false,
        agentSlot: "human",
        reason: "human_escalation_required",
      };
    default:
      return {
        ok: false,
        agentSlot: "human",
        reason: `unknown_slot:${slotId}`,
      };
  }
}

async function invokeGroqExperiment(
  packet: TroubleshootPacket,
): Promise<AgentResult> {
  const endpoint = resolveCodegenEndpoint();
  if (endpoint === "off") {
    return {
      ok: false,
      agentSlot: "groq-experiment",
      reason: "groq_not_configured",
    };
  }

  const prompt = [
    "Troubleshoot this vibe-engine-os issue. Reply with a short actionable recommendation.",
    `Symptom: ${packet.symptom}`,
    packet.body ? `Context: ${packet.body}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${endpoint.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        agentSlot: "groq-experiment",
        reason: `groq_http_${response.status}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const recommendation = data.choices?.[0]?.message?.content?.trim() ?? "";

    return {
      ok: Boolean(recommendation),
      agentSlot: "groq-experiment",
      recommendation,
      reason: recommendation ? undefined : "empty_groq_response",
    };
  } catch (error: unknown) {
    return {
      ok: false,
      agentSlot: "groq-experiment",
      reason: error instanceof Error ? error.message : "groq_fetch_failed",
    };
  }
}
