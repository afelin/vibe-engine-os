import * as crypto from "node:crypto";
import type { VibeDepth } from "../os/depth.js";
import {
  applyStackableDeltas,
  loadLegalSpacePack,
} from "../policy/stackables.js";
import { loadMandates, type Mandates } from "../policy/evaluate.js";
import { evaluateTaskBond } from "./evaluate.js";
import { sealTaskBond } from "./seal.js";
import { formatSealVerdict, formatTaskBondEvalVerdict } from "./verdict.js";

export type TaskBondGauntletCase = {
  id: string;
  category: string;
  depth?: number;
  intent?: string;
  outcomes?: string[];
  boundFiles?: string[];
  constraints?: string[];
  issue_body?: string;
  profile?: string;
  /** Overlay legal-space pack for this case (does not mutate .vibe/). */
  legal_space?: string;
  expect: { ok: true } | { ok: false; reason: string };
};

export type GauntletCaseResult = {
  id: string;
  category: string;
  assertion_ref: string;
  case_hash: string;
  expected: { ok: boolean; reason?: string };
  got: { ok: boolean; reason?: string };
  pass: boolean;
};

export type GauntletScorecard = {
  ts: string;
  total: number;
  pass: number;
  fail: number;
  by_category: Record<string, { pass: number; fail: number }>;
  results: GauntletCaseResult[];
};

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function resolveCaseMandates(
  c: TaskBondGauntletCase,
  rootDir: string,
): Mandates | undefined {
  if (!c.legal_space) return undefined;
  return applyStackableDeltas(
    loadMandates(rootDir),
    loadLegalSpacePack(c.legal_space, rootDir),
  );
}

function runCase(
  c: TaskBondGauntletCase,
  rootDir: string,
  lineNo: number,
  casesRef: string,
): GauntletCaseResult {
  const previousProfile = process.env.VIBE_PROJECT_PROFILE;
  if (c.profile) {
    process.env.VIBE_PROJECT_PROFILE = c.profile;
  } else {
    delete process.env.VIBE_PROJECT_PROFILE;
  }

  try {
    const depth = (c.depth ?? 3) as VibeDepth;
    const mandates = resolveCaseMandates(c, rootDir);

    let got: { ok: boolean; reason?: string };
    if (c.issue_body) {
      const sealed = sealTaskBond({
        issueNumber: "gauntlet",
        issueTitle: c.id,
        issueBody: c.issue_body,
        depth,
        rootDir,
        mandates,
      });
      const verdict = formatSealVerdict(sealed);
      got = verdict.ok
        ? { ok: true }
        : { ok: false, reason: verdict.reason };
    } else {
      const parsed = {
        intent: c.intent ?? "",
        outcomes: c.outcomes ?? [],
        boundFiles: c.boundFiles ?? [],
        constraints: c.constraints ?? [],
      };
      const evaluation = evaluateTaskBond(
        parsed,
        depth,
        rootDir,
        mandates,
      );
      const verdict = formatTaskBondEvalVerdict(evaluation);
      got = verdict.ok
        ? { ok: true }
        : { ok: false, reason: verdict.reason };
    }

    const expected = c.expect;
    const pass =
      expected.ok === got.ok &&
      (expected.ok || expected.reason === got.reason);

    return {
      id: c.id,
      category: c.category,
      assertion_ref: `${casesRef}#L${lineNo}`,
      case_hash: shortHash(JSON.stringify(c)),
      expected,
      got,
      pass,
    };
  } finally {
    if (previousProfile === undefined) {
      delete process.env.VIBE_PROJECT_PROFILE;
    } else {
      process.env.VIBE_PROJECT_PROFILE = previousProfile;
    }
  }
}

export function parseGauntletJsonl(raw: string): TaskBondGauntletCase[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TaskBondGauntletCase);
}

export function runTaskBondGauntlet(
  cases: TaskBondGauntletCase[],
  rootDir = ".",
  opts: { lineOffset?: number; casesRef?: string } = {},
): GauntletScorecard {
  const lineOffset = opts.lineOffset ?? 1;
  const casesRef = opts.casesRef ?? "evals/taskbond-gauntlet.jsonl";
  const results = cases.map((c, index) =>
    runCase(c, rootDir, lineOffset + index, casesRef),
  );

  const by_category: Record<string, { pass: number; fail: number }> = {};
  for (const result of results) {
    if (!by_category[result.category]) {
      by_category[result.category] = { pass: 0, fail: 0 };
    }
    if (result.pass) by_category[result.category].pass++;
    else by_category[result.category].fail++;
  }

  const pass = results.filter((r) => r.pass).length;
  return {
    ts: new Date().toISOString(),
    total: results.length,
    pass,
    fail: results.length - pass,
    by_category,
    results,
  };
}

export type BaselineRow = {
  id: string;
  case_hash: string;
  pass: boolean;
  reason?: string;
};

export function diffAgainstBaseline(
  scorecard: GauntletScorecard,
  baseline: Map<string, BaselineRow>,
): { regressions: GauntletCaseResult[]; newFailures: GauntletCaseResult[] } {
  const regressions: GauntletCaseResult[] = [];
  const newFailures: GauntletCaseResult[] = [];

  for (const result of scorecard.results) {
    const row = baseline.get(result.id);
    if (!row) {
      if (!result.pass) newFailures.push(result);
      continue;
    }
    if (row.pass && !result.pass) {
      regressions.push(result);
    }
  }

  return { regressions, newFailures };
}

export function scorecardToBaselineRows(
  scorecard: GauntletScorecard,
): BaselineRow[] {
  return scorecard.results.map((r) => ({
    id: r.id,
    case_hash: r.case_hash,
    pass: r.pass,
    reason: r.got.ok ? undefined : r.got.reason,
  }));
}

export function readBaselineMap(raw: string): Map<string, BaselineRow> {
  const map = new Map<string, BaselineRow>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed) as BaselineRow;
    map.set(row.id, row);
  }
  return map;
}

export function mergeScorecards(
  parts: GauntletScorecard[],
): GauntletScorecard {
  const results = parts.flatMap((part) => part.results);
  const by_category: Record<string, { pass: number; fail: number }> = {};
  for (const result of results) {
    if (!by_category[result.category]) {
      by_category[result.category] = { pass: 0, fail: 0 };
    }
    if (result.pass) by_category[result.category].pass++;
    else by_category[result.category].fail++;
  }
  const pass = results.filter((r) => r.pass).length;
  return {
    ts: new Date().toISOString(),
    total: results.length,
    pass,
    fail: results.length - pass,
    by_category,
    results,
  };
}
