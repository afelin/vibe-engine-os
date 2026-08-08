#!/usr/bin/env npx tsx
/**
 * CLI: npm run coreward:gate-candidates -- emit|list|show [id]
 */
import {
  emitGateCandidatesFromLessons,
  listGateCandidates,
  readGateCandidate,
} from "./gate-candidates.js";

function usage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  npm run coreward:gate-candidates -- emit [--limit N]",
      "  npm run coreward:gate-candidates -- list",
      "  npm run coreward:gate-candidates -- show <id>",
      "",
      "Friday ritual: emit → review → PR merge into gates.json (or close stubs).",
      "",
    ].join("\n"),
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "list";
  const root = ".";

  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    usage();
    return;
  }

  if (cmd === "emit") {
    let limit = 20;
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === "--limit" && argv[i + 1]) {
        limit = Number(argv[++i]);
      }
    }
    const { written, candidates } = emitGateCandidatesFromLessons(root, {
      limit: Number.isFinite(limit) ? limit : 20,
    });
    process.stdout.write(
      `${JSON.stringify({ written, count: candidates.length }, null, 2)}\n`,
    );
    return;
  }

  if (cmd === "list") {
    const list = listGateCandidates(root);
    process.stdout.write(
      `${JSON.stringify(
        list.map((c) => ({
          id: c.id,
          failureClass: c.failureClass,
          suggested_paths: c.suggested_paths,
          createdAt: c.createdAt,
          status: c.status,
        })),
        null,
        2,
      )}\n`,
    );
    process.stdout.write(`\n${list.length} candidate(s) in .vibe/gate-candidates/\n`);
    return;
  }

  if (cmd === "show") {
    const id = argv[1];
    if (!id) {
      process.stderr.write("show requires <id>\n");
      usage();
      process.exit(1);
    }
    const c = readGateCandidate(root, id);
    if (!c) {
      process.stderr.write(`not found: ${id}\n`);
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify(c, null, 2)}\n`);
    return;
  }

  usage();
  process.exit(1);
}

main();
