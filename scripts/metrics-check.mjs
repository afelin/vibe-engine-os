#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function runJson(command, args) {
  const out = execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return JSON.parse(out);
}

function main() {
  let scoreboard;
  let autoresearch;
  try {
    scoreboard = runJson("bash", ["runs/scoreboard.sh", "--json"]);
    autoresearch = runJson("bash", ["runs/autoresearch.sh", "--summary-json"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`metrics-check: fail (invalid metrics payload) - ${message}`);
    process.exit(1);
  }

  const runs = Number(scoreboard?.runs ?? 0);
  const healN = Number(scoreboard?.healMix?.n ?? 0);
  const firstPassRate = Number(scoreboard?.firstPassRate ?? 0);

  const warnings = [];
  if (runs < 5) warnings.push(`low_sample_runs=${runs}`);
  if (healN < 3) warnings.push(`low_heal_rows=${healN}`);
  if (firstPassRate < 0.3 && runs >= 5) warnings.push(`low_first_pass_rate=${firstPassRate.toFixed(2)}`);

  const summary = {
    runs,
    healRows: healN,
    firstPassRate,
    scoreboardHeal: autoresearch?.scoreboardHeal ?? null,
    warnings,
  };

  if (warnings.length > 0) {
    console.warn(`metrics-check: warning ${warnings.join(", ")}`);
  } else {
    console.log("metrics-check: ok");
  }
  console.log(JSON.stringify(summary));
}

main();
