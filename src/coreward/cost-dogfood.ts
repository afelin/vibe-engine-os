#!/usr/bin/env npx tsx
/**
 * Cost Plane dogfood: bonded ContextPack vs unbound baseline.
 * Writes .vibe/cost-dogfood.json. Exit nonzero if ratio < 5× unless COREWARD_COST_CLAIM=off.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildContextPack, formatContextPackBundle } from "../context/context-pack.js";

const FIXTURE_PATHS = [
  "src/coreward/authorize-write.ts",
  "src/coreward/mode.ts",
  "src/context/context-pack.ts",
  "src/context/bundle.ts",
];

const MIN_RATIO = 5;
const UNBOUND_SAMPLE_DIRS = ["src/coreward", "src/context", "src/os", "src/release-gate"];

function collectUnboundChars(rootDir: string, dirs: string[], maxFiles = 80): number {
  let total = 0;
  let count = 0;
  for (const dir of dirs) {
    const abs = join(rootDir, dir);
    if (!existsSync(abs)) continue;
    const entries = readdirSync(abs, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!/\.(ts|js|md)$/.test(ent.name)) continue;
      const file = join(abs, ent.name);
      try {
        total += readFileSync(file, "utf8").length;
        count++;
        if (count >= maxFiles) return total;
      } catch {
        /* skip */
      }
    }
  }
  return total;
}

function main(): void {
  const rootDir = process.cwd();
  const claimOff =
    process.env.COREWARD_COST_CLAIM?.trim().toLowerCase() === "off";

  const bond = FIXTURE_PATHS.filter((p) => existsSync(join(rootDir, p)));
  if (bond.length === 0) {
    process.stderr.write("cost-dogfood: no fixture paths found\n");
    process.exit(2);
  }

  const pack = buildContextPack(rootDir, {
    bond_files: bond,
    ticket_id: "cost-dogfood",
    useCache: false,
  });
  const formatted = formatContextPackBundle(rootDir, pack);
  const boundChars = formatted.totalChars;
  const unboundChars = collectUnboundChars(rootDir, UNBOUND_SAMPLE_DIRS);
  const ratio =
    boundChars > 0 ? Math.round((unboundChars / boundChars) * 100) / 100 : 0;

  const report = {
    schema: "coreward.cost_dogfood.v1",
    built_at: new Date().toISOString(),
    bond_paths: bond,
    bound_contextChars: boundChars,
    unbound_contextChars: unboundChars,
    ratio_unbound_over_bound: ratio,
    min_ratio_claim: MIN_RATIO,
    graph_cache_hit: pack.graph_cache_hit ?? false,
    hops: pack.hops,
    claim_enforced: !claimOff,
    pass: claimOff || ratio >= MIN_RATIO,
  };

  const outDir = join(rootDir, ".vibe");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "cost-dogfood.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Wrote ${outPath}\n`);

  if (!report.pass) {
    process.stderr.write(
      `cost-dogfood: ratio ${ratio}× < ${MIN_RATIO}× — trim marketing claim or set COREWARD_COST_CLAIM=off\n`,
    );
    process.exit(1);
  }
}

main();
