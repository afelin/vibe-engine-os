import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { computeVowsHash } from "./vows.js";
import type { RunManifest } from "../run/manifest.js";
import { resolveRunDir } from "../run/paths.js";

export type CapsuleInput = {
  manifest: RunManifest;
  snapshot: unknown;
  traceTail?: string[];
};

function canonicalize(value: unknown): string {
  return JSON.stringify(value);
}

export function computeCapsuleHash(input: CapsuleInput): string {
  const payload = {
    manifest: input.manifest,
    snapshot: input.snapshot,
    traceTail: input.traceTail ?? [],
    vowsHash: computeVowsHash(),
  };
  return crypto.createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}

export function writeCapsuleHash(
  rootDir: string,
  runId: string,
  hash: string,
): void {
  const dir = resolveRunDir(rootDir, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "capsule.hash"), `${hash}\n`, "utf8");
}

export function readCapsuleHash(rootDir: string, runId: string): string | null {
  const hashPath = path.join(resolveRunDir(rootDir, runId), "capsule.hash");
  if (!fs.existsSync(hashPath)) return null;
  return fs.readFileSync(hashPath, "utf8").trim() || null;
}

export function readTraceTail(rootDir: string, runId: string, limit = 5): string[] {
  const tracePath = path.join(resolveRunDir(rootDir, runId), "trace.jsonl");
  if (!fs.existsSync(tracePath)) return [];

  const lines = fs
    .readFileSync(tracePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.slice(-limit);
}
