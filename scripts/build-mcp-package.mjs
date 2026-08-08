#!/usr/bin/env node
/**
 * Bundle src/release-gate/mcp.ts (+ deps) into packages/mcp for npm publish.
 * Layout places JSON assets where the single-file bundle resolves import.meta.url.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(root, "packages", "mcp");
const distDir = path.join(pkgDir, "dist");
const esbuild = path.join(root, "node_modules", ".bin", "esbuild");

function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) cpDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

if (!fs.existsSync(esbuild)) {
  console.error("esbuild not found — run npm install at repo root first");
  process.exit(1);
}

rmrf(distDir);
fs.mkdirSync(distDir, { recursive: true });

const entry = path.join(pkgDir, "src", "entry.ts");
const outfile = path.join(distDir, "cli.js");
const build = spawnSync(
  esbuild,
  [
    entry,
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outfile}`,
    "--log-level=warning",
  ],
  { cwd: root, encoding: "utf8" },
);
if (build.status !== 0) {
  console.error(build.stderr || build.stdout || "esbuild failed");
  process.exit(build.status ?? 1);
}

// Single-file bundle: dirname(import.meta.url) === dist/
fs.copyFileSync(
  path.join(root, "src/release-gate/gates.json"),
  path.join(distDir, "gates.json"),
);
fs.copyFileSync(
  path.join(root, "src/policy/mandates.json"),
  path.join(distDir, "mandates.json"),
);
fs.copyFileSync(
  path.join(root, "src/constitution/vows.json"),
  path.join(distDir, "vows.json"),
);
cpDir(
  path.join(root, "src/policy/stackables/legal-spaces"),
  path.join(distDir, "stackables", "legal-spaces"),
);
cpDir(
  path.join(root, "src/policy/profiles"),
  path.join(distDir, "profiles"),
);

// bond/profile.ts resolves ../policy/profiles from import.meta.url (dist/)
const policyProfiles = path.join(pkgDir, "policy", "profiles");
rmrf(path.join(pkgDir, "policy"));
cpDir(path.join(root, "src/policy/profiles"), policyProfiles);

fs.chmodSync(path.join(pkgDir, "bin", "coreward-mcp.js"), 0o755);

console.log(`Built @coreward/mcp → ${path.relative(root, outfile)}`);
