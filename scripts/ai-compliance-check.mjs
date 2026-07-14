#!/usr/bin/env node
/**
 * Monthly compliance scan — banned providers, corp/experiment boundary.
 * Usage: npm run ai:compliance-check
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BANNED_ENV = [
  "OMNIROUTE_OAUTH_PROVIDER",
  "COPILOT_M365_TOKEN",
  "CLAUDE_WEB_SESSION",
  "CHATGPT_WEB_SESSION",
  "NOTEBOOKLM_MCP_TOKEN",
];

const findings = [];

for (const name of BANNED_ENV) {
  if (process.env[name]?.trim()) {
    findings.push(`banned env set: ${name}`);
  }
}

const corpMarker = path.join(rootDir, ".vibe", "corp-boundary");
const isCorp = fs.existsSync(corpMarker);

if (isCorp && process.env.GROQ_API_KEY?.trim()) {
  findings.push("GROQ_API_KEY in corp-marked repo");
}

const trustScript = path.join(rootDir, "scripts", "ai-trust-check.sh");
if (fs.existsSync(trustScript)) {
  const result = spawnSync("bash", [trustScript], {
    cwd: rootDir,
    env: { ...process.env, VIBE_ROOT: rootDir },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    findings.push(result.stderr?.trim() || "ai-trust-check.sh failed");
  }
}

const mcpPath = path.join(rootDir, ".cursor", "mcp.json");
if (fs.existsSync(mcpPath)) {
  try {
    const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    const servers = Object.keys(mcp.mcpServers ?? {});
    const allowed = new Set(["vibe-release-gates", "user-vibe-release-gates"]);
    for (const server of servers) {
      if (
        /notebooklm|omniroute|copilot-m365|claude-web/i.test(server) &&
        !allowed.has(server)
      ) {
        findings.push(`suspicious MCP server in mcp.json: ${server}`);
      }
    }
  } catch {
    findings.push("could not parse .cursor/mcp.json");
  }
}

const report = {
  ok: findings.length === 0,
  corpMarked: isCorp,
  findings,
  checkedAt: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
