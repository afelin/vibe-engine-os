import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseGateFeedbackEntry } from "../constitution/parse.js";
import { remediationForValidator } from "../verification/pipeline.js";

export type GateFeedbackEntry = {
  gate_id: string;
  remediation_instruction: string;
  examples?: string[];
  cacheHash: string;
  updatedAt: string;
};

const CACHE_DIR = ".vibe/cache/gates";

function cachePath(rootDir: string, gateId: string): string {
  const safeId = gateId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(rootDir, CACHE_DIR, `${safeId}.json`);
}

function computeCacheHash(entry: Omit<GateFeedbackEntry, "cacheHash">): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(entry), "utf8")
    .digest("hex");
}

export function seedGateFeedbackCache(rootDir: string): void {
  const seeds: Array<Omit<GateFeedbackEntry, "cacheHash" | "updatedAt">> = [
    { gate_id: "path_traversal", remediation_instruction: remediationForValidator("path_traversal") },
    { gate_id: "generated_patch_file_policy", remediation_instruction: remediationForValidator("generated_patch_file_policy") },
    { gate_id: "protected_files", remediation_instruction: remediationForValidator("protected_files") },
    { gate_id: "esm_import_extensions", remediation_instruction: remediationForValidator("esm_import_extensions") },
    { gate_id: "no_secrets", remediation_instruction: remediationForValidator("no_secrets") },
    { gate_id: "agent_mandate", remediation_instruction: remediationForValidator("agent_mandate") },
    { gate_id: "bond_compliance", remediation_instruction: "Use only paths from the execution plan and bound file set." },
    { gate_id: "typescript_compiler", remediation_instruction: "Fix TypeScript compile errors before retrying." },
    { gate_id: "vitest", remediation_instruction: "Fix failing tests before retrying." },
    { gate_id: "causal_critic", remediation_instruction: "Address the critic rejection before retrying." },
  ];

  for (const seed of seeds) {
    writeGateFeedbackEntry(rootDir, seed);
  }
}

export function writeGateFeedbackEntry(
  rootDir: string,
  entry: Omit<GateFeedbackEntry, "cacheHash" | "updatedAt">,
): GateFeedbackEntry {
  const updatedAt = new Date().toISOString();
  const withoutHash = { ...entry, updatedAt };
  const cacheHash = computeCacheHash(withoutHash);
  const validated = parseGateFeedbackEntry({ ...withoutHash, cacheHash });

  const dir = path.join(rootDir, CACHE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    cachePath(rootDir, entry.gate_id),
    `${JSON.stringify(validated, null, 2)}\n`,
    "utf8",
  );
  return validated;
}

export function readGateFeedbackEntry(
  rootDir: string,
  gateId: string,
): GateFeedbackEntry | null {
  const filePath = cachePath(rootDir, gateId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return parseGateFeedbackEntry(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

export function resolveRemediation(
  rootDir: string,
  gateId: string,
  fallback: string,
): { instruction: string; cacheHash?: string } {
  const cached = readGateFeedbackEntry(rootDir, gateId);
  if (cached) {
    return { instruction: cached.remediation_instruction, cacheHash: cached.cacheHash };
  }
  return { instruction: fallback };
}
