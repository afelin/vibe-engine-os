import * as fs from "node:fs";
import * as path from "node:path";
import { listLegalSpaces, listProjectProfiles } from "../policy/stackables.js";

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
  contract: {
    call_order: { preflight: string[]; postrun: string[] };
    expect: { on_success: string[]; on_failure: string[] };
    blocks_promotion: string[];
    stackables?: { legal_spaces: string[]; project_profiles: string[] };
  };
};

const PREFLIGHT_TOOLS = [
  "get_active_stack",
  "list_stackables",
  "evaluate_mandate",
  "validate_bond",
  "resolve_gate",
  "constitution_schemas",
] as const;

const POSTRUN_TOOLS = [
  "validate_capsule",
  "build_scoped_context",
  "recall_lessons",
] as const;

const BLOCKS_PROMOTION = [
  "mandate_violation",
  "missing_approval",
  "invalid_capsule",
  "vows_mismatch",
  "bond_invalid",
  "gate_failure",
  "replay_mismatch",
] as const;

export function buildAgentAdapterManifest(rootDir = "."): AgentAdapterManifest {
  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    ingress: {
      github_issue_labels: ["vibe/run", "vibe:safe", "vibe:ship", "vibe:plan-only"],
      slash_commands: [
        "/go",
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
    preflight_tools: [...PREFLIGHT_TOOLS],
    postrun_tools: [...POSTRUN_TOOLS],
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
    contract: {
      call_order: {
        preflight: [...PREFLIGHT_TOOLS],
        postrun: [...POSTRUN_TOOLS],
      },
      expect: {
        on_success: ["ok:true", "valid:true", "vowsCompliant:true", "capsuleHash"],
        on_failure: ["ok:false", "valid:false", "isError:true", "reason"],
      },
      blocks_promotion: [...BLOCKS_PROMOTION],
      stackables: {
        legal_spaces: listLegalSpaces(rootDir),
        project_profiles: listProjectProfiles(rootDir),
      },
    },
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
