/**
 * CLI: `npx tsx src/coreward/authorize-cli.ts --files a.ts,b.ts [--title ...] [--body ...]`
 * Alias: `npm run coreward:authorize`
 */
import { authorizeWrite } from "./authorize-write.js";
import { assertCorewardMode, isCorewardMode } from "./mode.js";

function parseArgs(argv: string[]): {
  files: string[];
  title: string;
  body: string;
  root: string;
  actor: string;
  checkMode: boolean;
  ticket: string;
  phase: "codegen" | "patch" | "promote" | "forever";
} {
  let files: string[] = [];
  let title = "";
  let body = "";
  let root = ".";
  let actor = "";
  let checkMode = false;
  let ticket = "";
  let phase: "codegen" | "patch" | "promote" | "forever" = "codegen";

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--files" || arg === "-f") {
      const raw = argv[++i] ?? "";
      files = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === "--title") {
      title = argv[++i] ?? "";
      continue;
    }
    if (arg === "--body") {
      body = argv[++i] ?? "";
      continue;
    }
    if (arg === "--root") {
      root = argv[++i] ?? ".";
      continue;
    }
    if (arg === "--actor") {
      actor = argv[++i] ?? "";
      continue;
    }
    if (arg === "--check-mode") {
      checkMode = true;
      continue;
    }
    if (arg === "--ticket") {
      ticket = argv[++i] ?? "";
      continue;
    }
    if (arg === "--phase") {
      phase = (argv[++i] ?? "codegen") as typeof phase;
      continue;
    }
  }

  return { files, title, body, root, actor, checkMode, ticket, phase };
}

const args = parseArgs(process.argv);

if (args.checkMode) {
  const result = {
    coreward_mode: isCorewardMode(args.root),
    gate: assertCorewardMode(args.root, args.phase, {
      paths: args.files,
      ticket_id: args.ticket || undefined,
    }),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.gate.ok ? 0 : 1);
}

if (args.files.length === 0) {
  console.error(
    "usage: authorize-cli.ts --files path1,path2 [--title t] [--body b] [--actor id]\n" +
      "       authorize-cli.ts --check-mode [--ticket id] [--files ...] [--phase codegen]",
  );
  process.exit(2);
}

const result = authorizeWrite({
  proposed_files: args.files,
  root_dir: args.root,
  title: args.title,
  body: args.body,
  actor: args.actor || undefined,
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
