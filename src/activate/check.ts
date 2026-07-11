import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { computeVowsHash, createVowAttestation, loadVows } from "../constitution/vows.js";
import { exportCatalogJsonSchema } from "../constitution/parse.js";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";

export type ActivateCheckResult = {
  nodeOk: boolean;
  nodeVersion: string;
  depsOk: boolean;
  vowsOk: boolean;
  vowsHash: string;
  errors: string[];
};

export function checkNodeVersion(minMajor = 22): { ok: boolean; version: string } {
  const version = process.version;
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return { ok: major >= minMajor, version };
}

export function checkDependencies(rootDir = "."): boolean {
  return fs.existsSync(path.join(rootDir, "node_modules"));
}

export function checkVowsPresent(rootDir = "."): boolean {
  return fs.existsSync(path.join(rootDir, "src/constitution/vows.json"));
}

export function runActivateChecks(rootDir = "."): ActivateCheckResult {
  const errors: string[] = [];
  const node = checkNodeVersion();
  if (!node.ok) {
    errors.push(
      `Node ${node.version} is below required v22 — run: nvm install 22 && nvm use (see .nvmrc)`,
    );
  }

  const depsOk = checkDependencies(rootDir);
  if (!depsOk) {
    errors.push("node_modules missing — run npm install");
  }

  const vowsOk = checkVowsPresent(rootDir);
  if (!vowsOk) {
    errors.push("src/constitution/vows.json missing");
  }

  let vowsHash = "";
  if (vowsOk) {
    try {
      loadVows(rootDir);
      vowsHash = computeVowsHash(rootDir);
    } catch (error: unknown) {
      errors.push(
        error instanceof Error ? error.message : "Failed to load vows.json",
      );
    }
  }

  return {
    nodeOk: node.ok,
    nodeVersion: node.version,
    depsOk,
    vowsOk,
    vowsHash,
    errors,
  };
}

export function smokeMcpHandlers(): { pass: boolean; gateCount: number } {
  const gates = JSON.parse(callReleaseGateTool("list_gates")) as string[];
  const schemas = JSON.parse(callReleaseGateTool("constitution_schemas")) as Record<
    string,
    unknown
  >;
  return {
    pass: gates.length > 0 && Boolean(schemas.ExecutionDag),
    gateCount: gates.length,
  };
}

export function exportSchemas(rootDir = "."): string {
  const vibeDir = path.join(rootDir, ".vibe");
  fs.mkdirSync(vibeDir, { recursive: true });
  const outPath = path.join(vibeDir, "schemas.json");
  const schemas = exportCatalogJsonSchema();
  fs.writeFileSync(outPath, `${JSON.stringify(schemas, null, 2)}\n`, "utf8");
  return outPath;
}

export type ActivatedState = {
  activatedAt: string;
  vowsHash: string;
  schemaVersion: string;
  gateSmokePass: boolean;
  checkPass: boolean;
};

export function writeActivatedJson(
  rootDir: string,
  state: ActivatedState,
): string {
  const vibeDir = path.join(rootDir, ".vibe");
  fs.mkdirSync(vibeDir, { recursive: true });
  const outPath = path.join(vibeDir, "activated.json");
  fs.writeFileSync(outPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return outPath;
}

export function runZeroTokenSmoke(rootDir = "."): void {
  const env = {
    ...process.env,
    ISSUE_NUMBER: "3",
    ISSUE_TITLE: "cloud loop",
    ISSUE_BODY: "src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts",
  };
  execSync("npm run local-issue", {
    cwd: rootDir,
    stdio: "pipe",
    env,
  });
}

export function printPersonaQuickstart(): void {
  const lines = [
    "",
    "✅ Vibe Engine activated",
    "",
    "Persona quickstart:",
    "  Lone AI engineer:  npm run activate  →  issue + vibe/run label or /vibe in body",
    "  Agentic engineer:  enable MCP (mcp.json) + .cursor/skills/vibe-engine",
    "  Agents:            docs/agent-protocol.md + constitution_schemas",
    "  Enterprise:        required Vibe Promotion Gate check on PR",
    "",
  ];
  process.stdout.write(lines.join("\n"));
}
