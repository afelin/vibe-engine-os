import * as fs from "node:fs";
import * as path from "node:path";
import { parseTaskBond } from "../constitution/parse.js";
import type { VibeDepth } from "../os/depth.js";
import type { TaskBond } from "./seal.js";

function bondPath(rootDir: string, issueNumber: string): string {
  const safeIssue = issueNumber.replace(/[^\w.-]/g, "_");
  return path.join(rootDir, ".runs", "bonds", `issue-${safeIssue}.bond.json`);
}

export function writeTaskBond(rootDir: string, bond: TaskBond): string {
  const filePath = bondPath(rootDir, bond.issueNumber);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(bond, null, 2)}\n`, "utf8");
  return filePath;
}

export function readTaskBond(
  rootDir: string,
  issueNumber: string,
): TaskBond | null {
  const filePath = bondPath(rootDir, issueNumber);
  if (!fs.existsSync(filePath)) return null;
  try {
    return parseTaskBond(JSON.parse(fs.readFileSync(filePath, "utf8"))) as TaskBond;
  } catch {
    return null;
  }
}
