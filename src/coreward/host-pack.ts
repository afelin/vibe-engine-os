/**
 * CLI: write host-pack templates into cwd.
 *   npx tsx src/coreward/host-pack.ts --host cursor|claude|opencode|zed [--force] [--root .]
 * Alias (when wired): npm run coreward:host-pack -- --host …
 *
 * Not an MCP tool — thin filesystem wrapper around templates/hosts/.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HOST_IDS = ["cursor", "claude", "opencode", "zed"] as const;
export type HostId = (typeof HOST_IDS)[number];

export type HostPackFile = {
  /** Path under templates/hosts/ */
  from: string;
  /** Destination relative to target root */
  to: string;
};

/** Files written for each --host (adopt templates use npx -y @coreward/mcp). */
export const HOST_PACK_MANIFEST: Record<HostId, HostPackFile[]> = {
  cursor: [
    { from: "cursor/mcp.json", to: ".cursor/mcp.json" },
    { from: "cursor/coreward.mdc", to: ".cursor/rules/coreward.mdc" },
  ],
  claude: [
    { from: "claude/mcp.json", to: ".mcp.json" },
    { from: "claude/CLAUDE.md", to: "CLAUDE.md" },
  ],
  opencode: [
    { from: "opencode/opencode.json", to: "opencode.json" },
    { from: "opencode/AGENTS.md", to: "AGENTS.md" },
  ],
  zed: [
    { from: "zed/settings.json", to: ".zed/settings.json" },
    { from: "zed/AGENTS.md", to: "AGENTS.md" },
  ],
};

export function isHostId(value: string): value is HostId {
  return (HOST_IDS as readonly string[]).includes(value);
}

export function resolveTemplatesRoot(repoRoot: string): string {
  return path.join(repoRoot, "templates", "hosts");
}

/** Repo root that owns templates/hosts (this package), not --root cwd. */
export function defaultRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export type ApplyHostPackResult = {
  host: HostId;
  written: string[];
  skipped: string[];
};

export function applyHostPack(opts: {
  host: HostId;
  /** Where files are written (adopter cwd). */
  targetRoot?: string;
  /** Coreward checkout that contains templates/hosts. */
  templatesRoot?: string;
  force?: boolean;
}): ApplyHostPackResult {
  const targetRoot = path.resolve(opts.targetRoot ?? ".");
  const templatesRoot =
    opts.templatesRoot ?? resolveTemplatesRoot(defaultRepoRoot());
  const force = Boolean(opts.force);
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of HOST_PACK_MANIFEST[opts.host]) {
    const src = path.join(templatesRoot, file.from);
    const dest = path.join(targetRoot, file.to);
    if (!fs.existsSync(src)) {
      throw new Error(`host-pack template missing: ${src}`);
    }
    if (fs.existsSync(dest) && !force) {
      skipped.push(file.to);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    written.push(file.to);
  }

  return { host: opts.host, written, skipped };
}

function parseArgs(argv: string[]): {
  host: string;
  root: string;
  force: boolean;
  help: boolean;
} {
  let host = "";
  let root = ".";
  let force = false;
  let help = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host") {
      host = argv[++i] ?? "";
      continue;
    }
    if (arg === "--root") {
      root = argv[++i] ?? ".";
      continue;
    }
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--help" || arg === "-?") {
      help = true;
      continue;
    }
  }

  return { host, root, force, help };
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: npx tsx src/coreward/host-pack.ts --host <cursor|claude|opencode|zed> [--force] [--root .]",
      "",
      "Writes adopt templates (npx -y @coreward/mcp) into the target root.",
      "Existing files are skipped unless --force.",
      "Codex / local packs: see templates/hosts/{codex,local}/ and docs/host-packs.md.",
      "",
    ].join("\n"),
  );
}

export function runHostPackCli(argv = process.argv): number {
  const args = parseArgs(argv);
  if (args.help || !args.host) {
    printHelp();
    return args.help ? 0 : 1;
  }
  if (!isHostId(args.host)) {
    console.error(
      `Unknown host "${args.host}". Expected: ${HOST_IDS.join("|")}`,
    );
    return 1;
  }

  const result = applyHostPack({
    host: args.host,
    targetRoot: args.root,
    force: args.force,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
        hint:
          result.skipped.length > 0
            ? "Re-run with --force to overwrite skipped files"
            : undefined,
      },
      null,
      2,
    ),
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runHostPackCli(process.argv));
}
