#!/usr/bin/env node
/**
 * Create a GitHub PR without the gh CLI (uses GITHUB_TOKEN or GH_TOKEN).
 * Usage: npm run pr:create -- --title "..." --head feat/branch [--base main] [--body-file path]
 *
 * Delegates to src/promote/create-pr-cli.ts (idempotent, detailed validation errors).
 */
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "src", "promote", "create-pr-cli.ts");
const result = spawnSync("npx", ["tsx", cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
