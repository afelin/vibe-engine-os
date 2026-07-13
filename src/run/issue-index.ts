import * as fs from "node:fs";
import * as path from "node:path";

export type IssueRunIndex = {
  runId: string;
  state: string;
  updatedAt: string;
};

function indexDir(rootDir: string): string {
  return path.join(rootDir, ".runs", "index");
}

function indexPath(rootDir: string, issueNumber: string): string {
  const safeIssue = issueNumber.replace(/[^a-zA-Z0-9._-]/g, "");
  return path.join(indexDir(rootDir), `issue-${safeIssue}.json`);
}

export function readIssueRunIndex(
  rootDir: string,
  issueNumber: string,
): IssueRunIndex | null {
  const filePath = indexPath(rootDir, issueNumber);
  if (!fs.existsSync(filePath)) return null;

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as IssueRunIndex;
  if (
    typeof raw.runId !== "string" ||
    typeof raw.state !== "string" ||
    typeof raw.updatedAt !== "string"
  ) {
    return null;
  }
  return raw;
}

export function writeIssueRunIndex(
  rootDir: string,
  issueNumber: string,
  entry: IssueRunIndex,
): void {
  const dir = indexDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    indexPath(rootDir, issueNumber),
    `${JSON.stringify(entry, null, 2)}\n`,
    "utf8",
  );
}
