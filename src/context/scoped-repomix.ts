import * as fs from "node:fs";
import * as path from "node:path";
import type { ExecutionDag } from "../os/events.js";
import { collectPlannedFiles } from "../planning/dag.js";

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"](\.[^'"]+)['"]/g;

export function resolveScopedFiles(
  rootDir: string,
  dag: ExecutionDag,
): string[] {
  const planned = collectPlannedFiles(dag);
  const resolved = new Set<string>();

  for (const file of planned) {
    resolved.add(file);
    const absPath = path.join(rootDir, file);
    if (!fs.existsSync(absPath)) continue;

    const content = fs.readFileSync(absPath, "utf8");
    const dir = path.dirname(file);

    for (const match of content.matchAll(IMPORT_RE)) {
      const importPath = match[1];
      if (!importPath.startsWith(".")) continue;

      const candidate = resolveLocalImport(rootDir, dir, importPath);
      if (candidate) {
        resolved.add(candidate);
      }
    }
  }

  return [...resolved].sort();
}

function resolveLocalImport(
  rootDir: string,
  dir: string,
  importPath: string,
): string | null {
  const base = path.normalize(path.join(dir, importPath));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ];

  for (const candidate of candidates) {
    if (candidate.endsWith(".js")) {
      const tsCandidate = candidate.replace(/\.js$/, ".ts");
      if (fs.existsSync(path.join(rootDir, tsCandidate))) return tsCandidate;
    }
    if (fs.existsSync(path.join(rootDir, candidate))) return candidate;
  }

  return null;
}

export function buildScopedRepomix(
  rootDir: string,
  dag: ExecutionDag,
): string {
  const files = resolveScopedFiles(rootDir, dag);
  const sections: string[] = [];

  for (const file of files) {
    const absPath = path.join(rootDir, file);
    if (!fs.existsSync(absPath)) continue;
    const content = fs.readFileSync(absPath, "utf8");
    sections.push(`--- ${file} ---\n${content}`);
  }

  return sections.join("\n\n");
}
