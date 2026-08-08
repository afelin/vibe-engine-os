import * as fs from "node:fs";
import * as path from "node:path";
import type { ExecutionDag } from "../os/events.js";
import { collectPlannedFiles } from "../planning/dag.js";

export const IMPORT_RE =
  /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"](\.[^'"]+)['"]/g;

export function resolveScopedFiles(
  rootDir: string,
  dag: ExecutionDag,
  maxHops = 1,
): string[] {
  const planned = collectPlannedFiles(dag);
  return collectImportClosure(rootDir, planned, maxHops);
}

/**
 * BFS import closure from seed paths, capped by maxHops.
 * Never returns paths outside the seed∪reachable-import set (no `..` escapes).
 */
export function collectImportClosure(
  rootDir: string,
  seeds: string[],
  maxHops = 1,
): string[] {
  const resolved = new Set<string>();
  const queue: Array<{ file: string; hop: number }> = [];

  for (const file of seeds) {
    const norm = normalizeRel(file);
    if (!norm || norm.includes("..")) continue;
    resolved.add(norm);
    queue.push({ file: norm, hop: 0 });
  }

  while (queue.length > 0) {
    const { file, hop } = queue.shift()!;
    if (hop >= maxHops) continue;

    const absPath = path.join(rootDir, file);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) continue;

    const content = fs.readFileSync(absPath, "utf8");
    const dir = path.dirname(file);

    for (const match of content.matchAll(IMPORT_RE)) {
      const importPath = match[1];
      if (!importPath?.startsWith(".")) continue;

      const candidate = resolveLocalImport(rootDir, dir, importPath);
      if (!candidate) continue;
      if (candidate.includes("..")) continue;
      if (resolved.has(candidate)) continue;
      // Escape: reject absolute / outside-repo style paths
      if (path.isAbsolute(candidate)) continue;
      resolved.add(candidate);
      queue.push({ file: candidate, hop: hop + 1 });
    }
  }

  return [...resolved].sort();
}

function normalizeRel(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function resolveLocalImport(
  rootDir: string,
  dir: string,
  importPath: string,
): string | null {
  const base = path.normalize(path.join(dir, importPath));
  // Reject path escape outside the logical tree
  if (base.startsWith("..") || path.isAbsolute(base)) return null;

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ];

  for (const candidate of candidates) {
    const norm = normalizeRel(candidate);
    if (norm.includes("..")) continue;
    if (candidate.endsWith(".js")) {
      const tsCandidate = candidate.replace(/\.js$/, ".ts");
      const tsNorm = normalizeRel(tsCandidate);
      if (tsNorm.includes("..")) continue;
      if (fs.existsSync(path.join(rootDir, tsNorm))) return tsNorm;
    }
    if (fs.existsSync(path.join(rootDir, norm))) return norm;
  }

  return null;
}

export function buildScopedRepomix(
  rootDir: string,
  dag: ExecutionDag,
  maxHops = 1,
): string {
  const files = resolveScopedFiles(rootDir, dag, maxHops);
  const sections: string[] = [];

  for (const file of files) {
    const absPath = path.join(rootDir, file);
    if (!fs.existsSync(absPath)) continue;
    const content = fs.readFileSync(absPath, "utf8");
    sections.push(`--- ${file} ---\n${content}`);
  }

  return sections.join("\n\n");
}
