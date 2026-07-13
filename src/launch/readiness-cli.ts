#!/usr/bin/env tsx
import { runLaunchReadiness } from "./readiness.js";

const rootDir = process.argv[2] ?? ".";
const jsonOnly = process.argv.includes("--json");

const result = runLaunchReadiness(rootDir);

if (jsonOnly) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  for (const check of result.checks) {
    const mark = check.ok ? "✓" : "✗";
    process.stdout.write(`${mark} ${check.id}: ${check.detail}\n`);
  }
  process.stdout.write(
    result.ok ? "\nlaunch:readiness green\n" : "\nlaunch:readiness failed\n",
  );
}

process.exit(result.ok ? 0 : 1);
