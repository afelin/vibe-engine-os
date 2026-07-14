import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPullRequest } from "./create-pr.js";

function parseArgs(argv: string[]) {
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

function repoSlug(): string {
  const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match) throw new Error(`Cannot parse GitHub repo from origin: ${remote}`);
  return match[1];
}

async function main() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN or GH_TOKEN required");
    process.exit(1);
  }

  const args = parseArgs(process.argv);
  if (!args.title || !args.head) {
    console.error(
      "Usage: create-pr-cli.ts --title TITLE --head BRANCH [--base main] [--body TEXT|--body-file PATH]",
    );
    process.exit(1);
  }

  const [owner, repo] = repoSlug().split("/");
  const result = await createPullRequest({
    token,
    owner,
    repo,
    title: args.title,
    head: args.head,
    base: args.base,
    body: args.body,
  });

  if (result.status === "existing") {
    console.error(`PR already exists (${result.state}): ${result.url}`);
  }
  console.log(result.url);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
