#!/usr/bin/env node
/**
 * Create a GitHub PR without the gh CLI (uses GITHUB_TOKEN or GH_TOKEN).
 * Usage: npm run pr:create -- --title "..." --head feat/branch [--base main] [--body-file path]
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function parseArgs(argv) {
  const out = { title: "", head: "", base: "main", body: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--title") out.title = argv[++i] ?? "";
    else if (arg === "--head") out.head = argv[++i] ?? "";
    else if (arg === "--base") out.base = argv[++i] ?? "main";
    else if (arg === "--body") out.body = argv[++i] ?? "";
    else if (arg === "--body-file") {
      out.body = readFileSync(argv[++i], "utf8");
    }
  }
  return out;
}

function repoSlug() {
  const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match) throw new Error(`Cannot parse GitHub repo from origin: ${remote}`);
  return match[1];
}

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN or GH_TOKEN required");
  process.exit(1);
}

const args = parseArgs(process.argv);
if (!args.title || !args.head) {
  console.error("Usage: create-pr.mjs --title TITLE --head BRANCH [--base main] [--body TEXT|--body-file PATH]");
  process.exit(1);
}

const [owner, repo] = repoSlug().split("/");
const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: args.title,
    head: args.head,
    base: args.base,
    body: args.body,
  }),
});

const payload = await response.json();
if (!response.ok) {
  console.error(payload.message ?? JSON.stringify(payload));
  process.exit(1);
}

console.log(payload.html_url);
