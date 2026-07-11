import * as fs from "node:fs";
import * as path from "node:path";

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;

export function mapChangedFilesToVitest(changedPaths: string[], rootDir = "."): string[] {
  const tests = new Set<string>();

  for (const changed of changedPaths) {
    if (changed.endsWith(".test.ts")) {
      tests.add(changed);
      continue;
    }

    const sibling = changed.replace(/\.ts$/, ".test.ts");
    if (fs.existsSync(path.join(rootDir, sibling))) {
      tests.add(sibling);
    }

    const importers = findImporters(changed, rootDir);
    for (const importer of importers) {
      const importerTest = importer.replace(/\.ts$/, ".test.ts");
      if (fs.existsSync(path.join(rootDir, importerTest))) {
        tests.add(importerTest);
      }
    }
  }

  return [...tests].sort();
}

function findImporters(target: string, rootDir: string): string[] {
  const targetBase = target.replace(/\.ts$/, "");
  const matches: string[] = [];

  for (const file of walkTsFiles(rootDir)) {
    const content = fs.readFileSync(path.join(rootDir, file), "utf8");
    for (const match of content.matchAll(IMPORT_RE)) {
      const importPath = match[1];
      if (!importPath.startsWith(".")) continue;
      const dir = path.dirname(file);
      const resolved = path.normalize(path.join(dir, importPath));
      const resolvedTs = resolved.endsWith(".js")
        ? resolved.replace(/\.js$/, ".ts")
        : `${resolved}.ts`;
      if (resolvedTs === target || resolvedTs === targetBase) {
        matches.push(file);
        break;
      }
    }
  }

  return matches;
}

function walkTsFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".runs") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        results.push(full);
      }
    }
  }

  walk(rootDir);
  return results.map((file) => path.relative(rootDir, file));
}

export function buildVitestSubgraphCommand(testFiles: string[]): string {
  if (testFiles.length === 0) return "npx vitest run";
  return `npx vitest run ${testFiles.map((f) => `"${f}"`).join(" ")}`;
}
