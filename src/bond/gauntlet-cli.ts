#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import {
  diffAgainstBaseline,
  mergeScorecards,
  parseGauntletJsonl,
  readBaselineMap,
  runTaskBondGauntlet,
  scorecardToBaselineRows,
  type GauntletScorecard,
} from "./gauntletRunner.js";

const MAIN_CASES = "evals/taskbond-gauntlet.jsonl";
const MAIN_BASELINE = "evals/taskbond-gauntlet-baseline.jsonl";
const REDTEAM_CASES = "evals/taskbond-gauntlet-redteam.jsonl";
const REDTEAM_BASELINE = "evals/taskbond-gauntlet-redteam-baseline.jsonl";

function writeBaselineFile(
  baselinePath: string,
  scorecard: GauntletScorecard,
): void {
  const lines = scorecardToBaselineRows(scorecard).map((row) =>
    JSON.stringify(row),
  );
  fs.writeFileSync(baselinePath, `${lines.join("\n")}\n`, "utf8");
  console.log(`baseline written: ${baselinePath}`);
}

function checkBaseline(
  scorecard: GauntletScorecard,
  baselinePath: string,
  label: string,
): void {
  if (!fs.existsSync(baselinePath)) return;
  const baseline = readBaselineMap(fs.readFileSync(baselinePath, "utf8"));
  const { regressions } = diffAgainstBaseline(scorecard, baseline);
  if (regressions.length > 0) {
    console.error(`${regressions.length} ${label} regression(s) vs baseline:`);
    for (const regression of regressions) {
      console.error(
        `  ${regression.id}: was pass, now ${JSON.stringify(regression.got)}`,
      );
    }
    process.exit(1);
  }
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const writeBaseline = args.includes("--write-baseline");
const redteamFlag =
  args.includes("--redteam") || process.env.VIBE_GAUNTLET_REDTEAM === "1";
const positional = args.filter(
  (arg) => arg !== "--write-baseline" && arg !== "--redteam",
);

const rootDir =
  positional.find((arg) => !arg.endsWith(".jsonl")) ?? ".";
const explicitCases = positional.filter((arg) => arg.endsWith(".jsonl"));

type Pack = {
  casesPath: string;
  baselinePath: string;
  label: string;
};

const packs: Pack[] = [];

if (explicitCases.length > 0) {
  for (const casesPath of explicitCases) {
    const resolved = path.isAbsolute(casesPath)
      ? casesPath
      : path.join(rootDir, casesPath);
    const baselinePath = resolved.replace(/\.jsonl$/, "-baseline.jsonl");
    packs.push({
      casesPath: resolved,
      baselinePath,
      label: path.basename(resolved),
    });
  }
} else {
  packs.push({
    casesPath: path.join(rootDir, MAIN_CASES),
    baselinePath: path.join(rootDir, MAIN_BASELINE),
    label: "main",
  });
  if (redteamFlag) {
    packs.push({
      casesPath: path.join(rootDir, REDTEAM_CASES),
      baselinePath: path.join(rootDir, REDTEAM_BASELINE),
      label: "redteam",
    });
  }
}

const scorecards: GauntletScorecard[] = [];

for (const pack of packs) {
  if (!fs.existsSync(pack.casesPath)) {
    console.error(`Missing ${pack.casesPath}`);
    process.exit(2);
  }

  const cases = parseGauntletJsonl(fs.readFileSync(pack.casesPath, "utf8"));
  const casesRef = path.relative(rootDir, pack.casesPath) || pack.casesPath;
  const scorecard = runTaskBondGauntlet(cases, rootDir, { casesRef });
  scorecards.push(scorecard);

  console.log(
    `taskbond-gauntlet[${pack.label}]: ${scorecard.pass}/${scorecard.total} passed (${scorecard.fail} failed)`,
  );

  if (writeBaseline) {
    writeBaselineFile(pack.baselinePath, scorecard);
  }

  if (scorecard.fail > 0) {
    for (const result of scorecard.results.filter((r) => !r.pass)) {
      console.error(
        `FAIL ${result.id} (${result.category}): expected ${JSON.stringify(result.expected)} got ${JSON.stringify(result.got)}`,
      );
    }
    process.exit(1);
  }

  if (!writeBaseline) {
    checkBaseline(scorecard, pack.baselinePath, pack.label);
  }
}

const merged = mergeScorecards(scorecards);
console.log(
  `taskbond-gauntlet: ${merged.pass}/${merged.total} passed (${merged.fail} failed)`,
);
console.log("taskbond-gauntlet: green");
