import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TroubleshootPacket } from "../../constitution/catalog.js";
import { parseTroubleshootPacket } from "../../constitution/parse.js";

import type { AgentResult } from "../types.js";

export function resolveCorpClaudeConfigDir(): string {
  if (process.env.CLAUDE_CONFIG_DIR?.trim()) {
    return process.env.CLAUDE_CONFIG_DIR.trim();
  }
  const home = os.homedir();
  const corpProfile = path.join(home, ".claude", "profiles", "corp");
  if (fs.existsSync(corpProfile)) return corpProfile;
  return path.join(home, ".claude");
}

export function detectCorpClaude(): boolean {
  const binary = process.env.CLAUDE_BINARY ?? "claude";
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

export async function invokeCorpClaude(
  packetInput: TroubleshootPacket,
): Promise<AgentResult> {
  const packet = parseTroubleshootPacket(packetInput);

  if (!detectCorpClaude()) {
    return {
      ok: false,
      agentSlot: "corp-claude",
      reason: "claude_cli_not_found",
    };
  }

  const binary = process.env.CLAUDE_BINARY ?? "claude";
  const configDir = resolveCorpClaudeConfigDir();
  const prompt = [
    "You are troubleshooting a vibe-engine-os issue. Respond with a concise recommendation only — do not write files.",
    `Symptom: ${packet.symptom}`,
    `Title: ${packet.title}`,
    packet.body ? `Body: ${packet.body}` : "",
    packet.gateId ? `Gate: ${packet.gateId}` : "",
    packet.boundFiles?.length
      ? `Bound files: ${packet.boundFiles.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = spawnSync(binary, ["-p", prompt], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    timeout: 120_000,
  });

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();

  if (result.status !== 0) {
    return {
      ok: false,
      agentSlot: "corp-claude",
      reason: stderr || "claude_exit_nonzero",
      stdout,
      stderr,
    };
  }

  return {
    ok: true,
    agentSlot: "corp-claude",
    recommendation: stdout,
    stdout,
    stderr,
  };
}
