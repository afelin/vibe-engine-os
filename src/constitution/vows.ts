import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type VowEntry = {
  id: string;
  category: "engine" | "operator" | "agent";
  text: string;
  enforceable_by: "catalog" | "mandate" | "machine" | "mcp" | "human";
};

export type VowsDocument = {
  version: string;
  vows: VowEntry[];
};

const vowsDir = path.dirname(fileURLToPath(import.meta.url));

export function vowsFilePath(rootDir = "."): string {
  const repoVows = path.join(rootDir, "src/constitution/vows.json");
  if (rootDir !== "." && fs.existsSync(repoVows)) {
    return repoVows;
  }
  return path.join(vowsDir, "vows.json");
}

export function loadVows(rootDir = "."): VowsDocument {
  const raw = fs.readFileSync(vowsFilePath(rootDir), "utf8");
  return JSON.parse(raw) as VowsDocument;
}

export function canonicalizeVows(doc: VowsDocument): string {
  return JSON.stringify(doc);
}

export function computeVowsHash(rootDir = "."): string {
  const doc = loadVows(rootDir);
  const canonical = canonicalizeVows(doc);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function createVowAttestation(rootDir = ".") {
  const doc = loadVows(rootDir);
  return {
    vowsVersion: doc.version,
    vowsHash: computeVowsHash(rootDir),
    attestedAt: new Date().toISOString(),
  };
}
