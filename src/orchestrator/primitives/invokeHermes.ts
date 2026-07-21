import { spawnSync } from "node:child_process";
import type { TroubleshootPacket } from "../../constitution/catalog.js";
import { parseTroubleshootPacket } from "../../constitution/parse.js";
import type { AgentResult } from "../types.js";

export type HermesConfig = {
  id: "hermes";
  enabled: boolean;
  binary: string;
  trustTier: "experiment" | "corporate" | "human-in-loop";
};

export function detectHermes(binary = "hermes"): boolean {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

export async function invokeHermes(
  packetInput: TroubleshootPacket,
  binary = "hermes",
): Promise<AgentResult> {
  const packet = parseTroubleshootPacket(packetInput);

  if (!detectHermes(binary)) {
    return {
      ok: false,
      agentSlot: "hermes",
      reason: "hermes_not_installed",
    };
  }

  const payload = JSON.stringify({
    symptom: packet.symptom,
    title: packet.title,
    body: packet.body,
    gateId: packet.gateId,
  });

  const result = spawnSync(binary, ["run", "--json", payload], {
    encoding: "utf8",
    timeout: 300_000,
  });

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();

  if (result.status !== 0) {
    return {
      ok: false,
      agentSlot: "hermes",
      reason: stderr || "hermes_exit_nonzero",
      stdout,
      stderr,
    };
  }

  let recommendation = stdout;
  try {
    const parsed = JSON.parse(stdout) as { recommendation?: string; output?: string };
    recommendation = parsed.recommendation ?? parsed.output ?? stdout;
  } catch {
    // keep raw stdout
  }

  return {
    ok: true,
    agentSlot: "hermes",
    recommendation,
    stdout,
    stderr,
  };
}
