/**
 * coreward:init — Node check → merge vibe-ref scripts → sync Cursor MCP/rule/hooks →
 * Coreward Mode on → light smoke (gate:mcp + ward:doctor) → ON chip + presence.
 * Defers full `npm run check` to CI.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { checkNodeVersion, checkDependencies } from "../activate/check.js";
import { writeCorewardModeConfig, isCorewardMode } from "./mode.js";
import { renderGovernanceStrip } from "../activate/visibility.js";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";
import { runWardDoctor } from "../ward/doctor.js";
import { writeCorewardPresence } from "./presence.js";
import { COREWARD_CURSOR_RULE } from "./cursor-rule.js";

const OPERATE_URL =
  "https://github.com/afelin/coreward/blob/main/docs/operate.md";

const CURSOR_MCP_SERVER = {
  command: "npx",
  args: ["tsx", "src/release-gate/mcp.ts"],
} as const;

/** Real path is `.cursor`; tests may override when OS blocks mkdir of that name. */
export function cursorDirRel(): string {
  const override = process.env.COREWARD_TEST_CURSOR_DIR?.trim();
  return override && override.length > 0 ? override : ".cursor";
}

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

/** Ensure Cursor mcp.json has only coreward-release-gates (drop dual-name confusion). */
export function syncCursorMcpJson(rootDir: string): string {
  const cursorMcpPath = path.join(rootDir, cursorDirRel(), "mcp.json");
  const desired = {
    mcpServers: {
      "coreward-release-gates": { ...CURSOR_MCP_SERVER },
    },
  };
  const next = `${JSON.stringify(desired, null, 2)}\n`;
  try {
    fs.mkdirSync(path.dirname(cursorMcpPath), { recursive: true });
    const prev = fs.existsSync(cursorMcpPath)
      ? fs.readFileSync(cursorMcpPath, "utf8")
      : "";
    if (prev === next) {
      return "Cursor MCP already single coreward-release-gates";
    }
    fs.writeFileSync(cursorMcpPath, next, "utf8");
    return prev
      ? "Synced .cursor/mcp.json → single coreward-release-gates"
      : "Wrote .cursor/mcp.json (coreward-release-gates)";
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : "write failed";
    return `⚠ .cursor/mcp.json sync skipped (${detail})`;
  }
}

/** Write/refresh alwaysApply Cursor rule from canonical template. */
export function syncCursorRule(rootDir: string): string {
  const rulePath = path.join(rootDir, cursorDirRel(), "rules", "coreward.mdc");
  const next = COREWARD_CURSOR_RULE.endsWith("\n")
    ? COREWARD_CURSOR_RULE
    : `${COREWARD_CURSOR_RULE}\n`;
  try {
    fs.mkdirSync(path.dirname(rulePath), { recursive: true });
    const prev = fs.existsSync(rulePath)
      ? fs.readFileSync(rulePath, "utf8")
      : "";
    if (prev === next) {
      return "Cursor rule coreward.mdc already current";
    }
    fs.writeFileSync(rulePath, next, "utf8");
    return prev
      ? "Refreshed .cursor/rules/coreward.mdc"
      : "Wrote .cursor/rules/coreward.mdc (alwaysApply)";
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : "write failed";
    return `⚠ .cursor/rules/coreward.mdc sync skipped (${detail})`;
  }
}

/** Confirm soft-remind hooks are wired (fail-open script + hooks.json). */
export function confirmCursorHooks(rootDir: string): string {
  const dir = cursorDirRel();
  const hooksJson = path.join(rootDir, dir, "hooks.json");
  const script = path.join(rootDir, dir, "hooks", "coreward-soft-remind.sh");
  if (!fs.existsSync(hooksJson)) {
    return "⚠ .cursor/hooks.json missing — soft remind not wired";
  }
  if (!fs.existsSync(script)) {
    return "⚠ .cursor/hooks/coreward-soft-remind.sh missing";
  }
  try {
    const raw = JSON.parse(fs.readFileSync(hooksJson, "utf8")) as {
      hooks?: Record<string, Array<{ command?: string }>>;
    };
    const commands = Object.values(raw.hooks ?? {})
      .flat()
      .map((h) => h.command ?? "");
    const wired = commands.some((c) => c.includes("coreward-soft-remind"));
    return wired
      ? "Cursor soft hooks confirmed (fail-open)"
      : "⚠ hooks.json present but soft-remind not referenced";
  } catch {
    return "⚠ .cursor/hooks.json unreadable";
  }
}

function printCollapsedMcpSnippet(rootDir: string): void {
  const mcpPath = path.join(rootDir, "mcp.json");
  console.log("If MCP is offline:");
  if (!fs.existsSync(mcpPath)) {
    console.log("  ⚠ root mcp.json missing — copy from Coreward install");
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
    const primary =
      raw.mcpServers?.["coreward-release-gates"] ??
      raw.mcpServers?.["vibe-release-gates"] ??
      CURSOR_MCP_SERVER;
    console.log(
      JSON.stringify(
        { mcpServers: { "coreward-release-gates": primary } },
        null,
        2,
      )
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
    );
  } catch {
    console.log("  ⚠ root mcp.json unreadable");
  }
}

export type InitSmokeResult = {
  ok: boolean;
  ticket_id: string | null;
};

function smokeGateMcp(rootDir: string): InitSmokeResult {
  try {
    const gates = JSON.parse(callReleaseGateTool("list_gates")) as string[];
    const preflight = JSON.parse(
      callReleaseGateTool("preflight", {
        proposed_files: ["src/ok-init-smoke.ts"],
        root_dir: rootDir,
      }),
    ) as { ok?: boolean; ticket_id?: string };
    const ticket_id =
      typeof preflight.ticket_id === "string" ? preflight.ticket_id : null;
    return {
      ok: gates.length > 0 && typeof preflight.ok === "boolean" && Boolean(preflight.ok),
      ticket_id,
    };
  } catch {
    return { ok: false, ticket_id: null };
  }
}

function printOnChip(rootDir: string, smokeTicketId: string | null): void {
  const strip = renderGovernanceStrip(rootDir);
  const ticketPart = smokeTicketId
    ? `${strip} · smoke ${smokeTicketId}`
    : strip;
  console.log("════════════════════════════════");
  console.log(" Coreward ON");
  console.log(` ${ticketPart}`);
  console.log(
    " MCP: enable coreward-release-gates in Cursor Settings if grey",
  );
  console.log(
    " Next: Agent will preflight once — or: npm run coreward:authorize -- --files …",
  );
  console.log("════════════════════════════════");
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

  const syncMsg = syncCursorMcpJson(rootDir);
  console.log(
    syncMsg.startsWith("⚠") ? syncMsg : `✓ ${syncMsg}`,
  );
  const ruleMsg = syncCursorRule(rootDir);
  console.log(ruleMsg.startsWith("⚠") ? ruleMsg : `✓ ${ruleMsg}`);
  const hooksMsg = confirmCursorHooks(rootDir);
  console.log(hooksMsg.startsWith("⚠") ? hooksMsg : `✓ ${hooksMsg}`);

  const smoke = smokeGateMcp(rootDir);
  console.log(
    smoke.ok
      ? `✓ gate:mcp smoke (list_gates + preflight)${smoke.ticket_id ? ` → ${smoke.ticket_id}` : ""}`
      : "❌ gate:mcp smoke failed",
  );
  if (!smoke.ok) return 1;

  try {
    writeCorewardPresence(rootDir, { ticket_id: smoke.ticket_id });
    console.log("✓ Wrote .vibe/coreward-presence.json");
  } catch {
    console.log("⚠ presence write skipped");
  }

  const doctor = runWardDoctor(rootDir);
  const hardFails = doctor.checks.filter((c) => !c.ok && !c.soft);
  console.log(
    doctor.ok
      ? "✓ ward:doctor"
      : `⚠ ward:doctor — ${hardFails.map((f) => f.detail).join("; ") || doctor.checks.filter((c) => !c.ok).map((c) => c.detail).join("; ")}`,
  );

  console.log("");
  printOnChip(rootDir, smoke.ticket_id);
  console.log("");
  printCollapsedMcpSnippet(rootDir);
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
