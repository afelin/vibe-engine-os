import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { loadActiveStack } from "../policy/stackables.js";
import { runActivateChecks } from "./check.js";

export const bootstrapSnippetsSchema = z.object({
  github: z.string().min(1),
  cursor: z.string().min(1),
  claude: z.string().min(1),
  codex: z.string().min(1),
  generic: z.string().min(1),
});

export type BootstrapSnippets = z.infer<typeof bootstrapSnippetsSchema>;

const PREFLIGHT_ORDER = "preflight (or authorize_write) once — prefer_gate; stop";

const SKILL_PATH = ".cursor/skills/coreward";

type McpServerConfig = {
  command: string;
  args: string[];
};

function loadMcpServerConfig(rootDir: string): McpServerConfig {
  const mcpPath = path.join(rootDir, "mcp.json");
  const raw = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
    mcpServers?: Record<string, McpServerConfig>;
  };
  const server =
    raw.mcpServers?.["coreward-release-gates"] ??
    raw.mcpServers?.["vibe-release-gates"];
  if (!server?.command || !Array.isArray(server.args)) {
    throw new Error("mcp.json missing coreward-release-gates command/args");
  }
  return server;
}

function formatMcpJsonBlock(server: McpServerConfig): string {
  return JSON.stringify(
    {
      mcpServers: {
        "coreward-release-gates": {
          command: server.command,
          args: server.args,
        },
      },
    },
    null,
    2,
  );
}

function preflightBlock(): string {
  return [
    `Agent vow: ${PREFLIGHT_ORDER}`,
    "Operate: /go · /approve (only when requiresApproval) · Merge when PR green.",
    "Docs: docs/start-here.md · docs/operate.md · docs/ward-security.md",
  ].join("\n");
}

export function renderBootstrapSnippets(rootDir = "."): BootstrapSnippets {
  const server = loadMcpServerConfig(rootDir);
  const mcpBlock = formatMcpJsonBlock(server);
  const mcpCommandLine = [server.command, ...server.args].join(" ");

  const github = [
    "## GitHub-only (nocode)",
    "1. Open a Coreward Request issue.",
    "2. Fill Intent, Outcome, and Files to touch (2–4 paths).",
    "3. Comment /go; merge when checks are green.",
    "",
    preflightBlock(),
    "",
    "See docs/start-here.md · docs/operate.md.",
  ].join("\n");

  const cursor = [
    "## Cursor + MCP + skill",
    "1. Enable MCP from repo-root mcp.json (or copy to .cursor/mcp.json).",
    `2. MCP server command: ${mcpCommandLine}`,
    `3. Enable skill path: ${SKILL_PATH} (SKILL.md).`,
    "4. Smoke: npm run gate:mcp · Init: npm run coreward:init",
    "",
    "mcp.json:",
    "```json",
    mcpBlock,
    "```",
    "",
    preflightBlock(),
  ].join("\n");

  const claude = [
    "## Claude / Claude Code — paste MCP server config",
    "Add this server to your Claude MCP settings (copy from mcp.json):",
    "",
    "```json",
    mcpBlock,
    "```",
    "",
    `Skill reference (Cursor-native): ${SKILL_PATH}`,
    "",
    preflightBlock(),
  ].join("\n");

  const codex = [
    "## Codex — paste MCP server config",
    "Register the coreward-release-gates MCP server (same as mcp.json):",
    "",
    "```json",
    mcpBlock,
    "```",
    "",
    `Command: ${mcpCommandLine}`,
    `Skill path (when using Cursor): ${SKILL_PATH}`,
    "",
    preflightBlock(),
  ].join("\n");

  const generic = [
    "## Generic agent / IDE",
    "1. Point your agent at the MCP surface from mcp.json.",
    `2. Command: ${mcpCommandLine}`,
    "3. Call preflight once before proposing paths; stop.",
    "",
    preflightBlock(),
    "",
    "Adapter manifest: .vibe/agent-adapter.json (npm run activate).",
    "Docs: docs/start-here.md · docs/operate.md.",
  ].join("\n");

  return bootstrapSnippetsSchema.parse({
    github,
    cursor,
    claude,
    codex,
    generic,
  });
}

export function writeBootstrapSnippets(
  rootDir = ".",
  snippets: BootstrapSnippets = renderBootstrapSnippets(rootDir),
): string {
  const vibeDir = path.join(rootDir, ".vibe");
  fs.mkdirSync(vibeDir, { recursive: true });
  const outPath = path.join(vibeDir, "bootstrap-snippets.json");
  fs.writeFileSync(outPath, `${JSON.stringify(snippets, null, 2)}\n`, "utf8");
  return outPath;
}

export function printBootstrapSnippets(snippets: BootstrapSnippets): void {
  const lines = [
    "",
    "✅ Governance bootstrap snippets",
    "",
    snippets.github,
    "",
    "---",
    "",
    snippets.cursor,
    "",
    "---",
    "",
    snippets.claude,
    "",
    "---",
    "",
    snippets.codex,
    "",
    "---",
    "",
    snippets.generic,
    "",
  ];
  process.stdout.write(lines.join("\n"));
}

export function runBootstrap(rootDir = "."): {
  snippetsPath: string;
  snippets: BootstrapSnippets;
} {
  const checks = runActivateChecks(rootDir);
  if (checks.errors.length > 0) {
    console.error("Bootstrap activate checks failed:");
    for (const error of checks.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const snippets = renderBootstrapSnippets(rootDir);
  const snippetsPath = writeBootstrapSnippets(rootDir, snippets);
  printBootstrapSnippets(snippets);
  console.log(
    `✓ Active legal space: ${loadActiveStack(rootDir)?.legalSpace ?? "none"}`,
  );
  console.log(`✓ Wrote ${snippetsPath}`);
  return { snippetsPath, snippets };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootDir =
    process.argv[2] ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  runBootstrap(rootDir);
}
