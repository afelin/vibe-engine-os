import {
  listReleaseGateIds,
  loadReleaseGates,
  resolveGateFromRegistry,
} from "./registry.js";
import { evaluateMandates } from "../policy/evaluate.js";
import {
  exportCatalogJsonSchema,
  parseRunManifest,
} from "../constitution/parse.js";
import { readActorSnapshot, readRunManifest } from "../run/manifest.js";
import { sanitizeRunId } from "../run/paths.js";
import {
  computeCapsuleHash,
  readCapsuleHash,
  readTraceTail,
} from "../constitution/capsule.js";
import { computeVowsHash } from "../constitution/vows.js";
import { sealTaskBond } from "../bond/seal.js";
import { writeTaskBond } from "../bond/store.js";
import {
  envelopeFromVerdict,
  formatMandateVerdict,
  formatSealVerdict,
} from "../bond/verdict.js";
import { contextPackOptsForDepth, getVibeDepth } from "../os/depth.js";
import {
  buildContextPack,
  formatContextPackBundle,
} from "../context/context-pack.js";
import { recallLessons } from "../memory/recall.js";
import type { ExecutionDag } from "../os/events.js";
import { parseExecutionDag } from "../constitution/parse.js";
import {
  listStackables,
  loadEffectiveMandates,
  readActiveStack,
  setLegalSpace,
} from "../policy/stackables.js";
import { cyberreadyValidateDelta } from "./cyberready-bridge.js";
import {
  getDefaultProfile,
  profileHash,
  resolveProfile,
} from "../agent-id/index.js";
import { authorizeWrite } from "../coreward/authorize-write.js";
import { assertCorewardMode, isCorewardMode } from "../coreward/mode.js";
import { axDenialFromReason } from "../coreward/ax-denial.js";

/** Canonical MCP server name (Coreward). */
export const RELEASE_GATE_MCP = {
  name: "coreward-release-gates",
  version: "2.0.0",
} as const;

/** Dual-read alias for existing Cursor mcp.json configs. */
export const RELEASE_GATE_MCP_ALIAS = "vibe-release-gates" as const;

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
};

const PREFLIGHT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    proposed_files: {
      type: "array",
      items: { type: "string" },
    },
    root_dir: { type: "string" },
    title: { type: "string" },
    body: { type: "string" },
    actor: { type: "string" },
  },
  required: ["proposed_files"],
} as const;

export const RELEASE_GATE_TOOLS = [
  {
    name: "preflight",
    description:
      "REQUIRED default tool before edits. House rules + Signed Mandate pathFilter + AgentId budget + prefer_gate. Returns { ok, ticket_id, prefer_gate?, stack, reason }. Call once; stop.",
    inputSchema: PREFLIGHT_INPUT_SCHEMA,
  },
  {
    name: "authorize_write",
    description:
      "[advanced] Alias of preflight (same args/result shape without stack). Prefer preflight.",
    inputSchema: PREFLIGHT_INPUT_SCHEMA,
  },
  {
    name: "list_gates",
    description:
      "[advanced] List deterministic release gate ids loaded from gates.json.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "resolve_gate",
    description:
      "[advanced] Match issue/review title and body against the gate registry. Returns a patch preview or null. Prefer prefer_gate from preflight.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "preview_gate",
    description:
      "[advanced] Return the compiled files for a gate id without matching title/body.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "evaluate_mandate",
    description:
      "[advanced] House rules only (standing forbids / approval prefixes from mandates.json + legal-space stackable). Not the Signed Mandate. Prefer preflight. Alias: evaluate_house_rules.",
    inputSchema: {
      type: "object",
      properties: {
        proposed_files: {
          type: "array",
          items: { type: "string" },
        },
        root_dir: { type: "string" },
      },
      required: ["proposed_files"],
    },
  },
  {
    name: "evaluate_house_rules",
    description:
      "[advanced] Alias of evaluate_mandate — house rules only (not Signed Mandate). Prefer preflight.",
    inputSchema: {
      type: "object",
      properties: {
        proposed_files: {
          type: "array",
          items: { type: "string" },
        },
        root_dir: { type: "string" },
      },
      required: ["proposed_files"],
    },
  },
  {
    name: "constitution_schemas",
    description:
      "[advanced] Export JSON Schema for all constitution catalog artifacts (DAG, manifest, gate failures, mandates).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "validate_capsule",
    description:
      "[advanced] Parse a local run capsule (manifest + actor snapshot) against the constitution catalog.",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
        run_id: { type: "string" },
        manifest: { type: "object" },
        snapshot: { type: "object" },
      },
    },
  },
  {
    name: "seal_bond",
    description:
      "[advanced] Parse and seal a TaskBond from issue body (intent, outcomes, bound files). Writes .runs/bonds/issue-N.bond.json.",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
        issue_number: { type: "string" },
        issue_title: { type: "string" },
        issue_body: { type: "string" },
        depth: { type: "number" },
      },
      required: ["issue_number", "issue_body"],
    },
  },
  {
    name: "validate_bond",
    description:
      "[advanced] Evaluate issue body as TaskBond without writing. Uses house rules and optional VIBE_PROJECT_PROFILE.",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
        issue_body: { type: "string" },
        depth: { type: "number" },
      },
      required: ["issue_body"],
    },
  },
  {
    name: "build_scoped_context",
    description:
      "[advanced] Build ContextPack v1 + legacy ScopedContextBundle from bond files. Pass ticket_id for multi-agent shared read model. Order: prefer_gate first — skip this on gate hit.",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
        bond_files: { type: "array", items: { type: "string" } },
        dag: { type: "object" },
        ticket_id: { type: "string" },
        max_total_chars: { type: "number" },
        max_per_file_chars: { type: "number" },
        max_hops: { type: "number" },
      },
      required: ["bond_files"],
    },
  },
  {
    name: "recall_lessons",
    description:
      "[advanced] Deterministic lesson recall by path prefix (no embeddings).",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
        path_prefixes: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
      },
      required: ["path_prefixes"],
    },
  },
  {
    name: "list_stackables",
    description:
      "[advanced] List available legal-space stackables and project profiles (fail-closed catalog).",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
      },
    },
  },
  {
    name: "set_legal_space",
    description:
      "[advanced] Write .vibe/active-stack.json with legalSpace (+ optional projectProfile). Rejects unknown ids. Does not edit policy packs.",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
        legal_space: { type: "string" },
        project_profile: { type: "string" },
      },
      required: ["legal_space"],
    },
  },
  {
    name: "get_active_stack",
    description:
      "[advanced] Read current .vibe/active-stack.json selection (legalSpace, projectProfile, activatedAt).",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
      },
    },
  },
  {
    name: "cyberready_validate_delta",
    description:
      "[advanced] Optional CyberReady bridge: validate compliance delta via CYBERREADY_SOCK. Fail-open when not installed — does not block house rules or promote.",
    inputSchema: {
      type: "object",
      properties: {
        sock_path: {
          type: "string",
          description: "Override CYBERREADY_SOCK Unix socket path",
        },
        payload: {
          type: "object",
          description: "Optional opaque validate_delta payload for IPC",
        },
      },
    },
  },
  {
    name: "resolve_agent_profile",
    description:
      "[advanced] Resolve an AgentId profile for an actor (principals + builtin CI override). Returns null when actor has no profile fields (legacy string actor still valid).",
    inputSchema: {
      type: "object",
      properties: {
        actor: {
          type: "string",
          description: "authorized_actor / AgentId string",
        },
        root_dir: { type: "string" },
        default: {
          type: "boolean",
          description: "When true, return getDefaultProfile instead of actor lookup",
        },
      },
    },
  },
  {
    name: "coreward_mode_status",
    description:
      "[advanced] Report whether Coreward Mode is enabled (.vibe/coreward-mode.json or COREWARD_MODE=1) and optionally assert engine-path authorization for paths/ticket.",
    inputSchema: {
      type: "object",
      properties: {
        root_dir: { type: "string" },
        phase: {
          type: "string",
          description: "codegen | patch | promote | forever",
        },
        paths: { type: "array", items: { type: "string" } },
        ticket_id: { type: "string" },
      },
    },
  },
] as const;

function runAuthorizeWriteArgs(args: Record<string, unknown>) {
  const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
  const proposedFiles = Array.isArray(args.proposed_files)
    ? args.proposed_files.filter((item): item is string => typeof item === "string")
    : [];
  return authorizeWrite({
    proposed_files: proposedFiles,
    root_dir: rootDir,
    title: typeof args.title === "string" ? args.title : undefined,
    body: typeof args.body === "string" ? args.body : undefined,
    actor: typeof args.actor === "string" ? args.actor : undefined,
  });
}

export function callReleaseGateTool(
  name: string,
  args: Record<string, unknown> = {},
): string {
  if (name === "preflight") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const result = runAuthorizeWriteArgs(args);
    const denial =
      !result.ok
        ? axDenialFromReason(
            result.reason,
            result.paths,
            result.prefer_gate,
          )
        : null;
    return JSON.stringify(
      {
        ok: result.ok,
        ticket_id: result.ticket_id,
        prefer_gate: result.prefer_gate ?? null,
        stack: readActiveStack(rootDir) ?? { legalSpace: "none" },
        reason: result.reason,
        paths: result.paths,
        ...(result.requiresApproval ? { requiresApproval: true } : {}),
        ...(denial
          ? { code: denial.code, next: denial.next }
          : {}),
        /** Cost-plane order reminder when gate is available. */
        ...(result.prefer_gate
          ? {
              short_circuit:
                "prefer_gate → apply gate (skip ContextPack + LLM)",
            }
          : {}),
      },
      null,
      2,
    );
  }

  if (name === "list_gates") {
    return JSON.stringify(listReleaseGateIds(), null, 2);
  }

  if (name === "resolve_gate") {
    const title = typeof args.title === "string" ? args.title : "";
    const body = typeof args.body === "string" ? args.body : "";
    return JSON.stringify(resolveGateFromRegistry(title, body), null, 2);
  }

  if (name === "preview_gate") {
    const id = typeof args.id === "string" ? args.id : "";
    const gate = loadReleaseGates().find((entry) => entry.id === id) ?? null;
    return JSON.stringify(gate, null, 2);
  }

  if (name === "evaluate_mandate" || name === "evaluate_house_rules") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const proposedFiles = Array.isArray(args.proposed_files)
      ? args.proposed_files.filter((item): item is string => typeof item === "string")
      : [];
    const mandates = loadEffectiveMandates(rootDir);
    const evaluation = evaluateMandates(proposedFiles, mandates);
    return JSON.stringify(
      {
        ...envelopeFromVerdict(formatMandateVerdict(evaluation)),
        mandates,
        evaluation,
        legalSpace: readActiveStack(rootDir)?.legalSpace ?? "none",
      },
      null,
      2,
    );
  }

  if (name === "constitution_schemas") {
    return JSON.stringify(exportCatalogJsonSchema(), null, 2);
  }

  if (name === "validate_capsule") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const runIdRaw = typeof args.run_id === "string" ? args.run_id : "";
    let runId = "";
    if (runIdRaw) {
      try {
        runId = sanitizeRunId(runIdRaw);
      } catch (error: unknown) {
        return JSON.stringify(
          {
            valid: false,
            manifest: null,
            manifestError:
              error instanceof Error ? error.message : "Invalid run_id",
            capsuleHash: null,
            vowsHash: computeVowsHash(rootDir),
            vowsCompliant: false,
            snapshotPresent: false,
            snapshotStatus: null,
          },
          null,
          2,
        );
      }
    }
    const manifestInput =
      args.manifest && typeof args.manifest === "object"
        ? args.manifest
        : null;
    const snapshotInput =
      args.snapshot && typeof args.snapshot === "object" ? args.snapshot : null;

    const snapshot =
      snapshotInput ??
      (runId ? readActorSnapshot(rootDir, runId) : null);

    let manifest = null;
    let manifestError: string | null = null;

    if (manifestInput) {
      try {
        manifest = parseRunManifest(manifestInput);
      } catch (error: unknown) {
        manifestError =
          error instanceof Error ? error.message : "Invalid manifest";
      }
    } else if (runId) {
      try {
        manifest = readRunManifest(rootDir, runId);
        if (!manifest) {
          manifestError = `Manifest not found for run_id ${runId}`;
        }
      } catch (error: unknown) {
        manifestError =
          error instanceof Error ? error.message : "Invalid manifest on disk";
      }
    } else {
      manifestError = "run_id or manifest required";
    }

    const vowsHash = computeVowsHash(rootDir);
    let capsuleHash: string | null = null;
    let vowsCompliant = false;

    if (manifest) {
      capsuleHash =
        manifest.capsuleHash ??
        readCapsuleHash(rootDir, manifest.runId) ??
        computeCapsuleHash({
          manifest,
          snapshot,
          traceTail: runId ? readTraceTail(rootDir, runId) : [],
        });
      vowsCompliant = manifest.vowsHash === vowsHash;
    }

    return JSON.stringify(
      {
        valid:
          manifest !== null &&
          manifestError === null &&
          (manifest.vowsHash ? vowsCompliant : true),
        manifest,
        manifestError,
        capsuleHash,
        vowsHash,
        vowsCompliant,
        snapshotPresent: snapshot !== null,
        snapshotStatus:
          snapshot && typeof snapshot === "object" && "status" in snapshot
            ? (snapshot as { status?: string }).status
            : null,
      },
      null,
      2,
    );
  }

  if (name === "seal_bond") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const issueNumber =
      typeof args.issue_number === "string" ? args.issue_number : "";
    const issueTitle =
      typeof args.issue_title === "string" ? args.issue_title : "Vibe Request";
    const issueBody = typeof args.issue_body === "string" ? args.issue_body : "";
    const depthArg = typeof args.depth === "number" ? args.depth : getVibeDepth();

    if (!issueNumber || !issueBody) {
      throw new Error("issue_number and issue_body required");
    }

    const result = sealTaskBond({
      issueNumber,
      issueTitle,
      issueBody,
      depth: depthArg as 0 | 1 | 2 | 3 | 4 | 5,
      rootDir,
    });

    if (result.ok) {
      const bondPath = writeTaskBond(rootDir, result.bond);
      return JSON.stringify(
        {
          valid: true,
          ...envelopeFromVerdict(formatSealVerdict(result)),
          bond: result.bond,
          path: bondPath,
          evaluation: result.evaluation,
        },
        null,
        2,
      );
    }

    const verdict = formatSealVerdict(result);
    return JSON.stringify(
      {
        valid: false,
        ...envelopeFromVerdict(verdict),
        errors: result.errors,
        evaluation: result.evaluation,
      },
      null,
      2,
    );
  }

  if (name === "validate_bond") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const issueBody = typeof args.issue_body === "string" ? args.issue_body : "";
    const depthArg = typeof args.depth === "number" ? args.depth : getVibeDepth();

    if (!issueBody) {
      throw new Error("issue_body required");
    }

    const result = sealTaskBond({
      issueNumber: "0",
      issueTitle: "validate",
      issueBody,
      depth: depthArg as 0 | 1 | 2 | 3 | 4 | 5,
      rootDir,
    });

    const verdict = formatSealVerdict(result);
    return JSON.stringify(
      result.ok
        ? {
            valid: true,
            ...envelopeFromVerdict(verdict),
            bond: result.bond,
            evaluation: result.evaluation,
          }
        : {
            valid: false,
            ...envelopeFromVerdict(verdict),
            errors: result.errors,
            evaluation: result.evaluation,
          },
      null,
      2,
    );
  }

  if (name === "build_scoped_context") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const bondFiles = Array.isArray(args.bond_files)
      ? args.bond_files.filter((item): item is string => typeof item === "string")
      : [];
    const dagInput: ExecutionDag =
      args.dag && typeof args.dag === "object"
        ? parseExecutionDag(args.dag)
        : {
            issueNumber: "0",
            title: "scoped-context",
            nodes: bondFiles.map((file, index) => ({
              id: `edit-${index + 1}`,
              title: "Bound file",
              kind: "edit" as const,
              dependsOn: [],
              risk: "low" as const,
              files: [file],
              acceptance: ["ok"],
            })),
          };

    const depth = getVibeDepth();
    const depthOpts = contextPackOptsForDepth(depth);
    const maxTotal =
      typeof args.max_total_chars === "number"
        ? args.max_total_chars
        : depthOpts.charBudget;
    const maxHops =
      typeof args.max_hops === "number" ? args.max_hops : depthOpts.maxHops;
    const ticketId =
      typeof args.ticket_id === "string" ? args.ticket_id : undefined;

    const pack = buildContextPack(rootDir, {
      bond_files: bondFiles,
      dag: dagInput,
      ticket_id: ticketId,
      maxHops,
      charBudget: maxTotal,
      maxPerFileChars:
        typeof args.max_per_file_chars === "number"
          ? args.max_per_file_chars
          : undefined,
      depth,
      allowLlm: depthOpts.allowLlm,
    });

    const formatted = formatContextPackBundle(rootDir, pack, {
      maxPerFileChars:
        typeof args.max_per_file_chars === "number"
          ? args.max_per_file_chars
          : undefined,
    });

    // Backward-compatible: legacy bundle fields + structured ContextPack
    return JSON.stringify(
      {
        files: formatted.files,
        totalChars: formatted.totalChars,
        truncated: formatted.truncated,
        pack: formatted.pack,
        graph_cache_hit: formatted.pack.graph_cache_hit === true,
        hops: formatted.pack.hops,
      },
      null,
      2,
    );
  }

  if (name === "recall_lessons") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const prefixes = Array.isArray(args.path_prefixes)
      ? args.path_prefixes.filter((item): item is string => typeof item === "string")
      : [];
    const limit = typeof args.limit === "number" ? args.limit : 5;
    const result = recallLessons(rootDir, prefixes, limit);
    return JSON.stringify(result, null, 2);
  }

  if (name === "list_stackables") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    return JSON.stringify(listStackables(rootDir), null, 2);
  }

  if (name === "set_legal_space") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const legalSpace =
      typeof args.legal_space === "string" ? args.legal_space : "";
    const projectProfile =
      typeof args.project_profile === "string" ? args.project_profile : undefined;
    if (!legalSpace.trim()) {
      throw new Error("legal_space required");
    }
    const stack = setLegalSpace(rootDir, legalSpace, projectProfile);
    return JSON.stringify({ ok: true, stack }, null, 2);
  }

  if (name === "get_active_stack") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const stack = readActiveStack(rootDir);
    return JSON.stringify(
      stack
        ? { ok: true, stack }
        : { ok: true, stack: null, hint: "unset — call list_stackables / set_legal_space (default none)" },
      null,
      2,
    );
  }

  if (name === "cyberready_validate_delta") {
    const sockPath =
      typeof args.sock_path === "string" ? args.sock_path : undefined;
    const payload =
      args.payload && typeof args.payload === "object"
        ? (args.payload as Record<string, unknown>)
        : undefined;
    return JSON.stringify(
      cyberreadyValidateDelta({ sockPath, payload }),
      null,
      2,
    );
  }

  if (name === "resolve_agent_profile") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const wantDefault = args.default === true;
    const actor = typeof args.actor === "string" ? args.actor.trim() : "";
    const profile = wantDefault
      ? getDefaultProfile(rootDir)
      : actor
        ? resolveProfile(rootDir, actor)
        : getDefaultProfile(rootDir);
    return JSON.stringify(
      {
        ok: true,
        profile,
        profile_hash: profile ? profileHash(profile) : null,
      },
      null,
      2,
    );
  }

  if (name === "authorize_write") {
    const result = runAuthorizeWriteArgs(args);
    if (!result.ok) {
      const denial = axDenialFromReason(
        result.reason,
        result.paths,
        result.prefer_gate,
      );
      return JSON.stringify(
        {
          ...result,
          code: denial.code,
          next: denial.next,
          ...(result.prefer_gate
            ? {
                short_circuit:
                  "prefer_gate → apply gate (skip ContextPack + LLM)",
              }
            : {}),
        },
        null,
        2,
      );
    }
    return JSON.stringify(
      {
        ...result,
        ...(result.prefer_gate
          ? {
              short_circuit:
                "prefer_gate → apply gate (skip ContextPack + LLM)",
            }
          : {}),
      },
      null,
      2,
    );
  }

  if (name === "coreward_mode_status") {
    const rootDir = typeof args.root_dir === "string" ? args.root_dir : ".";
    const enabled = isCorewardMode(rootDir);
    const paths = Array.isArray(args.paths)
      ? args.paths.filter((item): item is string => typeof item === "string")
      : [];
    const phaseRaw = typeof args.phase === "string" ? args.phase : "codegen";
    const phase =
      phaseRaw === "patch" ||
      phaseRaw === "promote" ||
      phaseRaw === "forever" ||
      phaseRaw === "codegen"
        ? phaseRaw
        : "codegen";
    const gate = assertCorewardMode(rootDir, phase, {
      paths,
      ticket_id:
        typeof args.ticket_id === "string" ? args.ticket_id : undefined,
    });
    return JSON.stringify(
      {
        ok: true,
        enabled,
        alias: RELEASE_GATE_MCP_ALIAS,
        server: RELEASE_GATE_MCP.name,
        gate,
      },
      null,
      2,
    );
  }

  throw new Error(`Unknown tool: ${name}`);
}

export function handleMcpRequest(
  message: JsonRpcRequest,
): JsonRpcResponse | null {
  const id = message.id ?? null;

  if (message.method === "notifications/initialized") {
    return null;
  }

  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: RELEASE_GATE_MCP,
      },
    };
  }

  if (message.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: { tools: RELEASE_GATE_TOOLS },
    };
  }

  if (message.method === "tools/call") {
    const params = message.params ?? {};
    const toolName = typeof params.name === "string" ? params.name : "";
    const toolArgs =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};

    try {
      const text = callReleaseGateTool(toolName, toolArgs);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text }],
          isError: false,
        },
      };
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Tool call failed";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: messageText }],
          isError: true,
        },
      };
    }
  }

  if (message.id === undefined) {
    return null;
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${message.method}` },
  };
}
