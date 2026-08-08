#!/usr/bin/env npx tsx
/**
 * Operator metrics — dogfood counters auto-updated by preflight/Mode.
 * Storage: .vibe/operator-metrics.json (local) or paste `comment` output on an issue.
 * Not a SaaS.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as crypto from "node:crypto";

export type OperatorMetrics = {
  turns_before_first_preflight: number | null;
  mode_denies: number | null;
  mode_allows: number | null;
  time_to_first_green_pr_min: number | null;
  /** Successful preflight / authorize_write ticket mints this session. */
  preflight_ok_count: number | null;
  /** Stable id for the current dogfood session (auto-minted). */
  session_id: string | null;
  /** Sessions that recorded a turn-1 preflight (for compliance %). */
  sessions_preflight_turn1: number | null;
  /** Total sessions that recorded at least one preflight. */
  sessions_with_preflight: number | null;
  updated_at: string | null;
};

const DEFAULT: OperatorMetrics = {
  turns_before_first_preflight: null,
  mode_denies: null,
  mode_allows: null,
  time_to_first_green_pr_min: null,
  preflight_ok_count: null,
  session_id: null,
  sessions_preflight_turn1: null,
  sessions_with_preflight: null,
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

function touch(m: OperatorMetrics): OperatorMetrics {
  return { ...m, updated_at: new Date().toISOString() };
}

function asCount(n: number | null): number {
  return n === null || !Number.isFinite(n) ? 0 : n;
}

/** Ensure a session_id exists; returns the id. */
export function ensureSession(cwd = process.cwd()): string {
  const cur = loadMetrics(cwd);
  if (cur.session_id) return cur.session_id;
  const session_id = `sess_${crypto.randomBytes(6).toString("hex")}`;
  saveMetrics(touch({ ...cur, session_id }), cwd);
  return session_id;
}

/**
 * Record a successful preflight / authorize_write.
 * Sets turns_before_first_preflight to 1 only when unset this session.
 * Increments preflight_ok_count and session tallies once per first ok.
 */
export function bumpPreflightOk(
  cwd = process.cwd(),
  opts?: { session_id?: string; turns?: number },
): OperatorMetrics {
  const cur = loadMetrics(cwd);
  const session_id = opts?.session_id ?? cur.session_id ?? ensureSession(cwd);
  const firstInSession = asCount(cur.preflight_ok_count) === 0;
  const turns =
    cur.turns_before_first_preflight === null
      ? (opts?.turns ?? 1)
      : cur.turns_before_first_preflight;

  const next = touch({
    ...cur,
    session_id,
    preflight_ok_count: asCount(cur.preflight_ok_count) + 1,
    turns_before_first_preflight: turns,
    sessions_with_preflight: firstInSession
      ? asCount(cur.sessions_with_preflight) + 1
      : cur.sessions_with_preflight,
    sessions_preflight_turn1: firstInSession && turns === 1
      ? asCount(cur.sessions_preflight_turn1) + 1
      : cur.sessions_preflight_turn1,
  });
  saveMetrics(next, cwd);
  return next;
}

export function bumpModeDeny(cwd = process.cwd()): OperatorMetrics {
  ensureSession(cwd);
  const cur = loadMetrics(cwd);
  const next = touch({
    ...cur,
    mode_denies: asCount(cur.mode_denies) + 1,
  });
  saveMetrics(next, cwd);
  return next;
}

export function bumpModeAllow(cwd = process.cwd()): OperatorMetrics {
  ensureSession(cwd);
  const cur = loadMetrics(cwd);
  const next = touch({
    ...cur,
    mode_allows: asCount(cur.mode_allows) + 1,
  });
  saveMetrics(next, cwd);
  return next;
}

/** Preflight-on-turn-1 compliance among sessions that used preflight. */
export function preflightCompliancePct(m: OperatorMetrics): number | null {
  const total = asCount(m.sessions_with_preflight);
  if (total === 0) return null;
  return Math.round((asCount(m.sessions_preflight_turn1) / total) * 100);
}

export function toCommentMarkdown(m: OperatorMetrics): string {
  const pct = preflightCompliancePct(m);
  return [
    "### Operator metrics (dogfood)",
    "",
    `| Counter | Value |`,
    `| --- | --- |`,
    `| Turns before first preflight | ${fmt(m.turns_before_first_preflight)} |`,
    `| Preflight ok count | ${fmt(m.preflight_ok_count)} |`,
    `| Mode denies | ${fmt(m.mode_denies)} |`,
    `| Mode allows | ${fmt(m.mode_allows)} |`,
    `| Time-to-first green PR (min) | ${fmt(m.time_to_first_green_pr_min)} |`,
    `| Preflight compliance % (turn 1) | ${pct === null ? "—" : `${pct}%`} |`,
    `| Session | ${m.session_id ?? "—"} |`,
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

export function runOperatorMetricsCli(argv: string[]): void {
  const { cmd, turns, denies, allows, ttf } = parseArgs(argv);
  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    process.stdout.write(
      [
        "Usage:",
        "  npm run coreward:metrics -- show",
        "  npm run coreward:metrics -- record [--turns N] [--denies D] [--allows A] [--ttf-green-pr-min M]",
        "  npm run coreward:metrics -- comment",
        "",
      ].join("\n"),
    );
    return;
  }

  if (cmd === "record") {
    const cur = loadMetrics();
    const next: OperatorMetrics = {
      ...cur,
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

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runOperatorMetricsCli(process.argv.slice(2));
}
