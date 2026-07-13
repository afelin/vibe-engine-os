import * as fs from "node:fs";
import * as path from "node:path";
import type { ExecutionDag } from "../os/events.js";
import { collectPlannedFiles } from "../planning/dag.js";
import { sha256Content } from "../run/promotion.js";
import { capContext, capFileContent } from "./cap.js";
import { resolveScopedFiles } from "./scoped-repomix.js";

export type ContextFileEntry = {
  path: string;
  content: string;
  contentHash: string;
};

export type ScopedContextBundle = {
  files: ContextFileEntry[];
  totalChars: number;
  truncated: boolean;
};

export type BuildContextBundleOpts = {
  maxTotalChars?: number;
  maxPerFileChars?: number;
};

export function resolveContextFiles(
  rootDir: string,
  dag: ExecutionDag,
  bondFiles: string[] = [],
): string[] {
  const planned = collectPlannedFiles(dag);
  const dagScoped =
    planned.length > 0 ? resolveScopedFiles(rootDir, dag) : bondFiles;
  const merged = new Set([...bondFiles, ...dagScoped]);
  return [...merged].sort();
}

export function buildContextBundle(
  rootDir: string,
  files: string[],
  opts: BuildContextBundleOpts = {},
): ScopedContextBundle {
  const maxTotal = opts.maxTotalChars ?? 16000;
  const maxPerFile = opts.maxPerFileChars ?? 4000;

  const entries: ContextFileEntry[] = [];
  let totalChars = 0;
  let truncated = false;

  for (const file of files) {
    const absPath = path.join(rootDir, file);
    if (!fs.existsSync(absPath)) continue;

    const raw = fs.readFileSync(absPath, "utf8");
    const { content, truncated: fileTruncated } = capFileContent(raw, maxPerFile);
    if (fileTruncated) truncated = true;

    const entryChars = content.length;
    if (totalChars + entryChars > maxTotal) {
      truncated = true;
      const remaining = maxTotal - totalChars;
      if (remaining > 100) {
        entries.push({
          path: file,
          content: capContext(content, remaining),
          contentHash: sha256Content(raw),
        });
        totalChars += remaining;
      }
      break;
    }

    entries.push({
      path: file,
      content,
      contentHash: sha256Content(raw),
    });
    totalChars += entryChars;
  }

  return { files: entries, totalChars, truncated };
}

export function formatContextBundleForPrompt(bundle: ScopedContextBundle): string {
  if (bundle.files.length === 0) return "";
  return bundle.files
    .map((entry) => `--- ${entry.path} ---\n${entry.content}`)
    .join("\n\n");
}
