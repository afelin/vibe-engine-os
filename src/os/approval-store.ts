import * as fs from "node:fs";
import * as path from "node:path";

export type PersistedApproval = {
  approvedBy: string;
  approvedAt: string;
  runId?: string;
};

function approvalsDir(rootDir: string): string {
  return path.join(rootDir, ".runs", "approvals");
}

function approvalPath(rootDir: string, issueNumber: string): string {
  const safeIssue = issueNumber.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(approvalsDir(rootDir), `issue-${safeIssue}.json`);
}

export function persistApproval(
  rootDir: string,
  issueNumber: string,
  actor: string,
  runId?: string,
): void {
  const dir = approvalsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  const record: PersistedApproval = {
    approvedBy: actor,
    approvedAt: new Date().toISOString(),
    ...(runId ? { runId } : {}),
  };
  fs.writeFileSync(
    approvalPath(rootDir, issueNumber),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

export function readPersistedApproval(
  rootDir: string,
  issueNumber: string,
): PersistedApproval | null {
  const filePath = approvalPath(rootDir, issueNumber);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PersistedApproval;
}

export function clearApproval(rootDir: string, issueNumber: string): void {
  const filePath = approvalPath(rootDir, issueNumber);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
