import * as fs from "node:fs";
import * as path from "node:path";
import { computeVowsHash } from "../constitution/vows.js";
import { smokeMcpHandlers } from "../activate/check.js";
import {
  diffAgainstBaseline,
  parseGauntletJsonl,
  readBaselineMap,
  runTaskBondGauntlet,
} from "../bond/gauntletRunner.js";

export type LaunchReadinessCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type LaunchReadinessResult = {
  ok: boolean;
  checks: LaunchReadinessCheck[];
};

const REQUIRED_WORKFLOWS = [
  "forever.yml",
  "vibe-pr-gate.yml",
  "tdd-attribution.yml",
  "vibe-auto-merge.yml",
] as const;

function checkFileExists(rootDir: string, relativePath: string): LaunchReadinessCheck {
  const fullPath = path.join(rootDir, relativePath);
  const ok = fs.existsSync(fullPath);
  return {
    id: `file:${relativePath}`,
    ok,
    detail: ok ? "present" : `missing: ${relativePath}`,
  };
}

export function checkRequiredWorkflows(rootDir = "."): LaunchReadinessCheck[] {
  return REQUIRED_WORKFLOWS.map((name) =>
    checkFileExists(rootDir, path.join(".github/workflows", name)),
  );
}

export function checkIssueTemplate(rootDir = "."): LaunchReadinessCheck {
  return checkFileExists(rootDir, ".github/ISSUE_TEMPLATE/vibe-request.yml");
}

export function checkVibeStarterTemplate(rootDir = "."): LaunchReadinessCheck {
  return checkFileExists(rootDir, ".github/ISSUE_TEMPLATE/vibe-starter.yml");
}

export function checkStartHereDoc(rootDir = "."): LaunchReadinessCheck {
  return checkFileExists(rootDir, "docs/start-here.md");
}

export function checkProofPage(rootDir = "."): LaunchReadinessCheck {
  return checkFileExists(rootDir, "proof/index.html");
}

export function checkGauntletBaseline(rootDir = "."): LaunchReadinessCheck {
  const casesPath = path.join(rootDir, "evals/taskbond-gauntlet.jsonl");
  const baselinePath = path.join(rootDir, "evals/taskbond-gauntlet-baseline.jsonl");

  if (!fs.existsSync(casesPath)) {
    return {
      id: "gauntlet:baseline",
      ok: false,
      detail: "missing evals/taskbond-gauntlet.jsonl",
    };
  }

  if (!fs.existsSync(baselinePath)) {
    return {
      id: "gauntlet:baseline",
      ok: false,
      detail: "missing evals/taskbond-gauntlet-baseline.jsonl",
    };
  }

  try {
    const cases = parseGauntletJsonl(fs.readFileSync(casesPath, "utf8"));
    const scorecard = runTaskBondGauntlet(cases, rootDir);

    if (scorecard.fail > 0) {
      return {
        id: "gauntlet:baseline",
        ok: false,
        detail: `${scorecard.fail}/${scorecard.total} gauntlet cases failed`,
      };
    }

    const baseline = readBaselineMap(fs.readFileSync(baselinePath, "utf8"));
    const { regressions } = diffAgainstBaseline(scorecard, baseline);
    if (regressions.length > 0) {
      return {
        id: "gauntlet:baseline",
        ok: false,
        detail: `${regressions.length} regression(s) vs baseline`,
      };
    }

    return {
      id: "gauntlet:baseline",
      ok: true,
      detail: `${scorecard.pass}/${scorecard.total} green vs baseline`,
    };
  } catch (error: unknown) {
    return {
      id: "gauntlet:baseline",
      ok: false,
      detail: error instanceof Error ? error.message : "gauntlet check failed",
    };
  }
}

export function checkMcpSmoke(): LaunchReadinessCheck {
  const smoke = smokeMcpHandlers();
  return {
    id: "mcp:smoke",
    ok: smoke.pass,
    detail: smoke.pass
      ? `${smoke.gateCount} gates + schemas ok`
      : "MCP handler smoke failed",
  };
}

export function checkActivatedJson(rootDir = "."): LaunchReadinessCheck {
  const activatedPath = path.join(rootDir, ".vibe/activated.json");
  if (!fs.existsSync(activatedPath)) {
    return {
      id: "activate:json",
      ok: true,
      detail: "optional — not yet activated",
    };
  }

  try {
    const state = JSON.parse(fs.readFileSync(activatedPath, "utf8")) as {
      vowsHash?: string;
      checkPass?: boolean;
      gateSmokePass?: boolean;
    };
    const currentHash = computeVowsHash(rootDir);
    const hashOk = state.vowsHash === currentHash;
    const checksOk = state.checkPass === true && state.gateSmokePass === true;

    return {
      id: "activate:json",
      ok: hashOk && checksOk,
      detail: hashOk && checksOk
        ? "activated.json fresh"
        : !hashOk
          ? "vowsHash stale — re-run npm run activate"
          : "activation checks incomplete",
    };
  } catch (error: unknown) {
    return {
      id: "activate:json",
      ok: false,
      detail: error instanceof Error ? error.message : "invalid activated.json",
    };
  }
}

export function runLaunchReadiness(rootDir = "."): LaunchReadinessResult {
  const checks: LaunchReadinessCheck[] = [
    ...checkRequiredWorkflows(rootDir),
    checkIssueTemplate(rootDir),
    checkVibeStarterTemplate(rootDir),
    checkStartHereDoc(rootDir),
    checkProofPage(rootDir),
    checkGauntletBaseline(rootDir),
    checkMcpSmoke(),
    checkActivatedJson(rootDir),
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

export function countGauntletCases(rootDir = "."): { pass: number; total: number } | null {
  const casesPath = path.join(rootDir, "evals/taskbond-gauntlet.jsonl");
  if (!fs.existsSync(casesPath)) return null;

  try {
    const cases = parseGauntletJsonl(fs.readFileSync(casesPath, "utf8"));
    const scorecard = runTaskBondGauntlet(cases, rootDir);
    return { pass: scorecard.pass, total: scorecard.total };
  } catch {
    return null;
  }
}
