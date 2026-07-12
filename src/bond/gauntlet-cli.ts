#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import {
  diffAgainstBaseline,
  parseGauntletJsonl,
  readBaselineMap,
  runTaskBondGauntlet,
  scorecardToBaselineRows,
} from "./gauntletRunner.js";

const rootDir = process.argv[2] ?? ".";
const writeBaseline = process.argv.includes("--write-baseline");
const casesPath = path.join(rootDir, "evals/taskbond-gauntlet.jsonl");
const baselinePath = path.join(rootDir, "evals/taskbond-gauntlet-baseline.jsonl");

if (!fs.existsSync(casesPath)) {
  console.error(`Missing ${casesPath}`);
  process.exit(2);
}

const cases = parseGauntletJsonl(fs.readFileSync(casesPath, "utf8"));
const scorecard = runTaskBondGauntlet(cases, rootDir);

console.log(
  `taskbond-gauntlet: ${scorecard.pass}/${scorecard.total} passed (${scorecard.fail} failed)`,
);

if (writeBaseline) {
  const lines = scorecardToBaselineRows(scorecard).map((row) =>
    JSON.stringify(row),
  );
  fs.writeFileSync(baselinePath, `${lines.join("\n")}\n`, "utf8");
  console.log(`baseline written: ${baselinePath}`);
}

if (scorecard.fail > 0) {
  for (const result of scorecard.results.filter((r) => !r.pass)) {
    console.error(
      `FAIL ${result.id} (${result.category}): expected ${JSON.stringify(result.expected)} got ${JSON.stringify(result.got)}`,
    );
  }
  process.exit(1);
}

if (fs.existsSync(baselinePath) && !writeBaseline) {
  const baseline = readBaselineMap(fs.readFileSync(baselinePath, "utf8"));
  const { regressions } = diffAgainstBaseline(scorecard, baseline);
  if (regressions.length > 0) {
    console.error(`${regressions.length} regression(s) vs baseline:`);
    for (const regression of regressions) {
      console.error(
        `  ${regression.id}: was pass, now ${JSON.stringify(regression.got)}`,
      );
    }
    process.exit(1);
  }
}

console.log("taskbond-gauntlet: green");
