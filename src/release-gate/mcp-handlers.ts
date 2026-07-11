import {
  listReleaseGateIds,
  loadReleaseGates,
  resolveGateFromRegistry,
} from "./registry.js";
import { evaluateMandates, loadMandates } from "../policy/evaluate.js";
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

export const RELEASE_GATE_MCP = {
  name: "vibe-release-gates",
  version: "1.0.0",
} as const;

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

export const RELEASE_GATE_TOOLS = [
  {
    name: "list_gates",
    description: "List deterministic release gate ids loaded from gates.json.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "resolve_gate",
    description:
      "Match issue/review title and body against the gate registry. Returns a patch preview or null.",
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
      "Return the compiled files for a gate id without matching title/body.",
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
      "Evaluate proposed file paths against agent mandates (forbidden and approval prefixes).",
    inputSchema: {
      type: "object",
      properties: {
        proposed_files: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["proposed_files"],
    },
  },
  {
    name: "constitution_schemas",
    description:
      "Export JSON Schema for all constitution catalog artifacts (DAG, manifest, gate failures, mandates).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "validate_capsule",
    description:
      "Parse a local run capsule (manifest + actor snapshot) against the constitution catalog.",
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
] as const;

export function callReleaseGateTool(
  name: string,
  args: Record<string, unknown> = {},
): string {
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

  if (name === "evaluate_mandate") {
    const proposedFiles = Array.isArray(args.proposed_files)
      ? args.proposed_files.filter((item): item is string => typeof item === "string")
      : [];
    return JSON.stringify(
      {
        mandates: loadMandates(),
        evaluation: evaluateMandates(proposedFiles),
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
