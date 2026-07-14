import * as fs from "node:fs";
import * as path from "node:path";

export type AgentAdapterManifest = {
  version: string;
  exportedAt: string;
  ingress: {
    github_issue_labels: string[];
    slash_commands: string[];
    mcp_seal_bond: string;
  };
  preflight_tools: string[];
  postrun_tools: string[];
  troubleshoot_tools: string[];
  external_agents: string[];
  npm_diagnostics: string[];
  schemas_path: string;
  skill_path: string;
  http_verify?: string;
};

export function buildAgentAdapterManifest(_rootDir = "."): AgentAdapterManifest {
  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    ingress: {
      github_issue_labels: ["vibe/run", "vibe:safe", "vibe:ship", "vibe:plan-only"],
      slash_commands: [
        "/vibe",
        "/status",
        "/approve",
        "/continue",
        "/retry",
        "/rollback",
        "/details",
        "/troubleshoot",
      ],
      mcp_seal_bond: "seal_bond",
    },
    preflight_tools: [
      "evaluate_mandate",
      "validate_bond",
      "resolve_gate",
      "constitution_schemas",
    ],
    postrun_tools: [
      "validate_capsule",
      "build_scoped_context",
      "recall_lessons",
    ],
    troubleshoot_tools: [
      "resolve_gate",
      "build_scoped_context",
      "validate_capsule",
      "recall_lessons",
      "evaluate_mandate",
    ],
    external_agents: ["corp-claude", "m365-guide", "hermes", "groq-experiment"],
    npm_diagnostics: ["bond:preflight", "replay", "launch:readiness", "scoreboard"],
    schemas_path: ".vibe/schemas.json",
    skill_path: ".cursor/skills/vibe-engine/SKILL.md",
    http_verify: "npm run constitution:serve",
  };
}

export function exportAgentAdapter(rootDir = "."): string {
  const vibeDir = path.join(rootDir, ".vibe");
  fs.mkdirSync(vibeDir, { recursive: true });
  const outPath = path.join(vibeDir, "agent-adapter.json");
  const manifest = buildAgentAdapterManifest(rootDir);
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return outPath;
}
