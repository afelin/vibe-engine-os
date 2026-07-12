import { loadMandates } from "./evaluate.js";

function parseApproverList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isApproverAllowed(actor: string, rootDir = "."): boolean {
  const mandates = loadMandates(rootDir);
  const envApprovers = parseApproverList(process.env.VIBE_APPROVERS);
  const mandateApprovers = mandates.approved_operators ?? [];
  const allApprovers = [...new Set([...mandateApprovers, ...envApprovers])];

  if (allApprovers.includes("*")) return true;

  if (allApprovers.length === 0) {
    if (process.env.GITHUB_ACTIONS === "true") return false;
    return true;
  }

  return allApprovers.includes(actor);
}
