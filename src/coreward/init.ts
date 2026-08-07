/**
 * coreward:init — Node check → merge vibe-ref scripts → MCP snippet →
 * Coreward Mode on → light smoke (gate:mcp + ward:doctor) → print operate URL.
 * Defers full `npm run check` to CI.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { checkNodeVersion, checkDependencies } from "../activate/check.js";
import { writeCorewardModeConfig, isCorewardMode } from "./mode.js";
import { renderGovernanceStrip } from "../activate/visibility.js";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";
import { runWardDoctor } from "../ward/doctor.js";

const OPERATE_URL =
  "https://github.com/afelin/coreward/blob/main/docs/operate.md";

function mergeVibeRefScripts(rootDir: string): string | null {
  const refPath = path.join(rootDir, "package.json.vibe-ref");
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(refPath) || !fs.existsSync(pkgPath)) {
    return null;
  }
  try {
    const ref = JSON.parse(fs.readFileSync(refPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const before = JSON.stringify(pkg.scripts ?? {});
    pkg.scripts = { ...(ref.scripts ?? {}), ...(pkg.scripts ?? {}) };
    if (JSON.stringify(pkg.scripts) === before) {
      return "package.json.vibe-ref scripts already merged (no change)";
    }
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    return "Merged scripts from package.json.vibe-ref into package.json";
  } catch (error: unknown) {
    return `vibe-ref merge skipped: ${
      error instanceof Error ? error.message : "parse error"
    }`;
  }
}

function printMcpSnippet(rootDir: string): void {
  const mcpPath = path.join(rootDir, "mcp.json");
  if (!fs.existsSync(mcpPath)) {
    console.log("⚠ mcp.json missing — copy from Coreward install");
    return;
  }
  const raw = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
    mcpServers?: Record<string, unknown>;
  };
  const primary =
    raw.mcpServers?.["coreward-release-gates"] ??
    raw.mcpServers?.["vibe-release-gates"];
  console.log("✓ MCP snippet (coreward-release-gates):");
  console.log(
    JSON.stringify(
      { mcpServers: { "coreward-release-gates": primary } },
      null,
      2,
    ),
  );
}

function smokeGateMcp(): boolean {
  try {
    const gates = JSON.parse(callReleaseGateTool("list_gates")) as string[];
    const preflight = JSON.parse(
      callReleaseGateTool("preflight", {
        proposed_files: ["src/ok-init-smoke.ts"],
      }),
    ) as { ok?: boolean };
    return gates.length > 0 && typeof preflight.ok === "boolean";
  } catch {
    return false;
  }
}

export function runCorewardInit(rootDir = "."): number {
  console.log("Coreward init");
  console.log("");

  const node = checkNodeVersion();
  if (!node.ok) {
    console.error(`❌ Node ${node.version} < v22 — install Node 22+`);
    return 1;
  }
  console.log(`✓ Node ${node.version}`);

  if (!checkDependencies(rootDir)) {
    console.error("❌ node_modules missing — run npm install");
    return 1;
  }
  console.log("✓ Dependencies present");

  const mergeMsg = mergeVibeRefScripts(rootDir);
  if (mergeMsg) console.log(`✓ ${mergeMsg}`);
  else console.log("✓ No package.json.vibe-ref (skip merge)");

  writeCorewardModeConfig(rootDir, { enabled: true });
  console.log(
    isCorewardMode(rootDir)
      ? "✓ Coreward Mode ON"
      : "⚠ Coreward Mode write failed",
  );
  console.log(
    "  Mandate keys (never silent): set VIBE_MANDATE_PRIVATE_KEY + VIBE_MANDATE_PUBLIC_KEY for Ward ON",
  );

  printMcpSnippet(rootDir);

  const mcpOk = smokeGateMcp();
  console.log(mcpOk ? "✓ gate:mcp smoke (list_gates + preflight)" : "❌ gate:mcp smoke failed");
  if (!mcpOk) return 1;

  const doctor = runWardDoctor(rootDir);
  const hardFails = doctor.checks.filter((c) => !c.ok && !c.soft);
  console.log(
    doctor.ok
      ? "✓ ward:doctor"
      : `⚠ ward:doctor — ${hardFails.map((f) => f.detail).join("; ") || doctor.checks.filter((c) => !c.ok).map((c) => c.detail).join("; ")}`,
  );

  console.log(`✓ ${renderGovernanceStrip(rootDir)}`);
  console.log("");
  console.log(`Operate: ${OPERATE_URL}`);
  console.log("Local:   docs/operate.md");
  console.log("Full check deferred to CI (Coreward Ship Readiness / npm run check).");
  // Light smoke: soft doctor hints (missing Mandate keys) do not fail init.
  return 0;
}

const invoked =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /init(\.ts|\.js)?$/.test(process.argv[1].replace(/\\/g, "/"));

if (invoked) {
  const root = process.argv[2] ?? ".";
  process.exit(runCorewardInit(root));
}
