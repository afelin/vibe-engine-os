#!/usr/bin/env npx tsx
/**
 * Operator metrics stub — three dogfood counters.
 * Storage: .vibe/operator-metrics.json (local) or paste `comment` output on an issue.
 * Not a SaaS.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type OperatorMetrics = {
  turns_before_first_preflight: number | null;
  mode_denies: number | null;
  mode_allows: number | null;
  time_to_first_green_pr_min: number | null;
  updated_at: string | null;
};

const DEFAULT: OperatorMetrics = {
  turns_before_first_preflight: null,
  mode_denies: null,
  mode_allows: null,
  time_to_first_green_pr_min: null,
  updated_at: null,
};

function artifactPath(cwd = process.cwd()): string {
  return join(cwd, ".vibe", "operator-metrics.json");
}

export function loadMetrics(cwd = process.cwd()): OperatorMetrics {
  const p = artifactPath(cwd);
  if (!existsSync(p)) return { ...DEFAULT };
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<OperatorMetrics>;
    return { ...DEFAULT, ...raw };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveMetrics(m: OperatorMetrics, cwd = process.cwd()): void {
  const dir = join(cwd, ".vibe");
  mkdirSync(dir, { recursive: true });
  writeFileSync(artifactPath(cwd), `${JSON.stringify(m, null, 2)}\n`, "utf8");
}

export function toCommentMarkdown(m: OperatorMetrics): string {
  return [
    "### Operator metrics (dogfood)",
    "",
    `| Counter | Value |`,
    `| --- | --- |`,
    `| Turns before first preflight | ${fmt(m.turns_before_first_preflight)} |`,
    `| Mode denies | ${fmt(m.mode_denies)} |`,
    `| Mode allows | ${fmt(m.mode_allows)} |`,
    `| Time-to-first green PR (min) | ${fmt(m.time_to_first_green_pr_min)} |`,
    "",
    m.updated_at ? `_Updated ${m.updated_at}_` : "_Not recorded yet — fill after one session._",
    "",
  ].join("\n");
}

function fmt(n: number | null): string {
  return n === null ? "—" : String(n);
}

function parseArgs(argv: string[]): {
  cmd: string;
  turns?: number;
  denies?: number;
  allows?: number;
  ttf?: number;
} {
  const [cmd = "show", ...rest] = argv;
  const out: ReturnType<typeof parseArgs> = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = rest[i + 1];
    if (a === "--turns" && next !== undefined) {
      out.turns = Number(next);
      i++;
    } else if (a === "--denies" && next !== undefined) {
      out.denies = Number(next);
      i++;
    } else if (a === "--allows" && next !== undefined) {
      out.allows = Number(next);
      i++;
    } else if (a === "--ttf-green-pr-min" && next !== undefined) {
      out.ttf = Number(next);
      i++;
    }
  }
  return out;
}

function main(): void {
  const { cmd, turns, denies, allows, ttf } = parseArgs(process.argv.slice(2));
  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    process.stdout.write(
      [
        "Usage:",
        "  npx tsx src/coreward/operator-metrics.ts show",
        "  npx tsx src/coreward/operator-metrics.ts record [--turns N] [--denies D] [--allows A] [--ttf-green-pr-min M]",
        "  npx tsx src/coreward/operator-metrics.ts comment",
        "",
      ].join("\n"),
    );
    return;
  }

  if (cmd === "record") {
    const cur = loadMetrics();
    const next: OperatorMetrics = {
      turns_before_first_preflight:
        turns !== undefined && Number.isFinite(turns)
          ? turns
          : cur.turns_before_first_preflight,
      mode_denies:
        denies !== undefined && Number.isFinite(denies) ? denies : cur.mode_denies,
      mode_allows:
        allows !== undefined && Number.isFinite(allows) ? allows : cur.mode_allows,
      time_to_first_green_pr_min:
        ttf !== undefined && Number.isFinite(ttf)
          ? ttf
          : cur.time_to_first_green_pr_min,
      updated_at: new Date().toISOString(),
    };
    saveMetrics(next);
    process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
    process.stdout.write(`Wrote ${artifactPath()}\n`);
    return;
  }

  const m = loadMetrics();
  if (cmd === "comment") {
    process.stdout.write(toCommentMarkdown(m));
    return;
  }

  // show (default)
  process.stdout.write(`${JSON.stringify(m, null, 2)}\n`);
  process.stdout.write(`\n${toCommentMarkdown(m)}`);
}

main();
