/**
 * CLI: `npx tsx src/savings/attest-cli.ts [--root .] [--run-id id ...] [--out path] [--stdout] [--dry-run]`
 * Alias: `npm run savings:attest`
 */
import * as path from "node:path";
import {
  buildAndWriteSavingsAttestation,
  buildSavingsAttestation,
  verifySavingsChain,
} from "./attest.js";

function parseArgs(argv: string[]): {
  root: string;
  runIds: string[];
  out: string | undefined;
  stdout: boolean;
  dryRun: boolean;
} {
  let root = ".";
  const runIds: string[] = [];
  let out: string | undefined;
  let stdout = false;
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      root = argv[++i] ?? ".";
      continue;
    }
    if (arg === "--run-id") {
      const id = argv[++i];
      if (id) runIds.push(id);
      continue;
    }
    if (arg === "--out") {
      out = argv[++i];
      continue;
    }
    if (arg === "--stdout") {
      stdout = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        "usage: attest-cli.ts [--root .] [--run-id id]... [--out path] [--stdout] [--dry-run]\n" +
          "  Builds a hash-chained savings attestation from run/scoreboard metrics\n" +
          "  (gate_hit, contextChars, tokensEstimate).\n",
      );
      process.exit(0);
    }
  }

  return { root, runIds, out, stdout, dryRun };
}

const args = parseArgs(process.argv);
const rootDir = path.resolve(args.root);
const runIds = args.runIds.length > 0 ? args.runIds : undefined;

const attestation = args.dryRun
  ? buildSavingsAttestation({ rootDir, runIds })
  : buildAndWriteSavingsAttestation({
      rootDir,
      runIds,
      relativePath: args.out,
    }).attestation;

const outPath = args.dryRun
  ? null
  : path.resolve(rootDir, args.out ?? ".vibe/savings-attestation.json");

if (!verifySavingsChain(attestation.chain)) {
  process.stderr.write("savings:attest: chain verification failed\n");
  process.exit(1);
}

if (args.stdout || args.dryRun) {
  process.stdout.write(`${JSON.stringify(attestation, null, 2)}\n`);
} else if (outPath) {
  process.stdout.write(
    `savings:attest: wrote ${outPath} (runs=${attestation.runCount} tip=${attestation.tipHash ?? "null"})\n`,
  );
  process.stdout.write(
    `summary: gateHits=${attestation.summary.gateHits} contextChars=${attestation.summary.totalContextChars} tokensEstimate=${attestation.summary.totalTokensEstimate}\n`,
  );
}
