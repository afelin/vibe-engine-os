import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GeneratedFile } from "../os/events.js";
import { resolveRunDir, sanitizeRunId } from "./paths.js";

export type PromotionIndexEntry = {
  path: string;
  sha256: string;
};

export type PromotionIndex = {
  files: PromotionIndexEntry[];
};

export function sha256Content(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function assertSafeRelativePath(filePath: string): void {
  if (
    !filePath ||
    filePath.includes("..") ||
    path.isAbsolute(filePath) ||
    filePath.startsWith("~")
  ) {
    throw new Error(`Unsafe promotion path: ${filePath}`);
  }
}

function resolvePromotionFile(rootDir: string, runId: string, filePath: string): string {
  assertSafeRelativePath(filePath);
  const filesRoot = path.join(resolveRunDir(rootDir, runId), "promotion", "files");
  const resolved = path.resolve(filesRoot, filePath);
  if (resolved !== filesRoot && !resolved.startsWith(`${filesRoot}${path.sep}`)) {
    throw new Error(`Promotion file escapes bundle: ${filePath}`);
  }
  return resolved;
}

export function writePromotionBundle(
  rootDir: string,
  runId: string,
  files: GeneratedFile[],
): void {
  const safeRunId = sanitizeRunId(runId);
  const promotionDir = path.join(resolveRunDir(rootDir, safeRunId), "promotion");
  fs.mkdirSync(promotionDir, { recursive: true });

  const index: PromotionIndex = {
    files: files.map((file) => {
      assertSafeRelativePath(file.path);
      return {
        path: file.path,
        sha256: sha256Content(file.content),
      };
    }),
  };

  for (const file of files) {
    const destPath = resolvePromotionFile(rootDir, safeRunId, file.path);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, file.content, "utf8");
  }

  fs.writeFileSync(
    path.join(promotionDir, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8",
  );
}

export function applyPromotionBundle(
  rootDir: string,
  runId: string,
): { applied: string[] } {
  const safeRunId = sanitizeRunId(runId);
  const indexPath = path.join(
    resolveRunDir(rootDir, safeRunId),
    "promotion",
    "index.json",
  );
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Promotion bundle not found for run ${safeRunId}`);
  }

  const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as PromotionIndex;
  const applied: string[] = [];

  for (const entry of index.files) {
    const srcPath = resolvePromotionFile(rootDir, safeRunId, entry.path);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Promotion file missing: ${entry.path}`);
    }
    const content = fs.readFileSync(srcPath, "utf8");
    const digest = sha256Content(content);
    if (digest !== entry.sha256) {
      throw new Error(`SHA256 mismatch for ${entry.path}`);
    }
    const destPath = path.join(rootDir, entry.path);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content, "utf8");
    applied.push(entry.path);
  }

  return { applied };
}
