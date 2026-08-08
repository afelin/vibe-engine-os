/**
 * ContextPack v1 — Agentic Cost Plane read model.
 * Ticket-bound graph of files/lessons/gates with char/hops caps and cache.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseContextPack } from "../constitution/parse.js";
import type { ExecutionDag } from "../os/events.js";
import {
  contextPackOptsForDepth,
  getVibeDepth,
  type VibeDepth,
} from "../os/depth.js";
import { loadReleaseGates } from "../release-gate/registry.js";
import { recallLessons } from "../memory/recall.js";
import { sha256Content } from "../run/promotion.js";
import { buildContextBundle, resolveContextFiles } from "./bundle.js";
import {
  collectImportClosure,
  resolveLocalImport,
  IMPORT_RE,
} from "./scoped-repomix.js";
import type { VerifiedMandate } from "../ward/index.js";

export const CONTEXT_PACK_VERSION = "context_pack.v1" as const;

export type ContextPackNodeKind = "file" | "lesson" | "gate";
export type ContextPackEdgeKind =
  | "imports"
  | "bound"
  | "lesson_on"
  | "gate_matches";

export type ContextPackNode = {
  id: string;
  kind: ContextPackNodeKind;
  path?: string;
  lesson_id?: string;
  gate_id?: string;
};

export type ContextPackEdge = {
  from: string;
  to: string;
  kind: ContextPackEdgeKind;
};

export type ContextPackLesson = {
  id: string;
  path: string;
  failureClass: string;
  reuseWhen: string[];
  gate_id?: string;
  symptom: string;
  fix: string;
};

export type ContextPack = {
  version: typeof CONTEXT_PACK_VERSION;
  ticket_id?: string;
  root: string;
  paths: string[];
  nodes: ContextPackNode[];
  edges: ContextPackEdge[];
  lessons: ContextPackLesson[];
  char_budget: number;
  hops: number;
  cache_key: string;
  built_at: string;
  /** Present when pack was served from cache. */
  graph_cache_hit?: boolean;
};

export type BuildContextPackOpts = {
  ticket_id?: string;
  bond_files?: string[];
  dag?: ExecutionDag;
  maxHops?: number;
  charBudget?: number;
  maxFiles?: number;
  maxPerFileChars?: number;
  depth?: VibeDepth;
  /** Skip LLM-bound content assembly when false (depth 0–1). */
  allowLlm?: boolean;
  now?: () => string;
  /** Disable cache for tests. */
  useCache?: boolean;
  /** When set, shrink resolved paths to Mandate∩profile path_constraints. */
  verifiedMandate?: VerifiedMandate | null;
};

type CacheEntry = { pack: ContextPack; built_at: string };

const memoryCache = new Map<string, CacheEntry>();
const DISK_CACHE_REL = path.join(".vibe", "context-pack-cache");

/** Test helper. */
export function clearContextPackCache(): void {
  memoryCache.clear();
}

function diskCachePath(rootDir: string, cacheKey: string): string {
  const safe = cacheKey.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
  return path.join(rootDir, DISK_CACHE_REL, `${safe}.json`);
}

function readDiskCache(rootDir: string, cacheKey: string): ContextPack | null {
  const filePath = diskCachePath(rootDir, cacheKey);
  if (!fs.existsSync(filePath)) return null;
  try {
    return parseContextPack(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

function writeDiskCache(rootDir: string, pack: ContextPack): void {
  const filePath = diskCachePath(rootDir, pack.cache_key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
}

export function computeContextPackCacheKey(input: {
  paths: string[];
  hops: number;
  charBudget: number;
  digests: string[];
  ticket_id?: string;
}): string {
  const body = [
    input.ticket_id ?? "",
    String(input.hops),
    String(input.charBudget),
    ...[...input.paths].sort(),
    ...input.digests,
  ].join("\0");
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

function fileDigest(rootDir: string, rel: string): string {
  const abs = path.join(rootDir, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return "missing";
  return sha256Content(fs.readFileSync(abs, "utf8"));
}

/**
 * Build ContextPack v1 from bond/ticket paths with import/lesson/gate graph.
 * Never emits paths outside ticket ∪ import closure (escape-safe).
 */
export function buildContextPack(
  rootDir: string,
  opts: BuildContextPackOpts = {},
): ContextPack {
  const depth = opts.depth ?? getVibeDepth();
  const depthOpts = contextPackOptsForDepth(depth);
  const hops = opts.maxHops ?? depthOpts.maxHops;
  const charBudget = opts.charBudget ?? depthOpts.charBudget;
  const allowLlm = opts.allowLlm ?? depthOpts.allowLlm;
  const maxFiles = opts.maxFiles ?? 32;
  const maxPerFile = opts.maxPerFileChars ?? 4000;
  const bondFiles = (opts.bond_files ?? []).map((p) => p.replace(/\\/g, "/"));
  const now = opts.now ?? (() => new Date().toISOString());
  const useCache = opts.useCache !== false;

  const dag: ExecutionDag =
    opts.dag ??
    ({
      issueNumber: "0",
      title: "context-pack",
      nodes: bondFiles.map((file, index) => ({
        id: `edit-${index + 1}`,
        title: "bound file",
        kind: "edit" as const,
        dependsOn: [],
        risk: "low" as const,
        files: [file],
        acceptance: ["ok"],
      })),
    } as ExecutionDag);

  const seedPaths =
    bondFiles.length > 0
      ? resolveContextFiles(rootDir, dag, bondFiles, {
          verifiedMandate: opts.verifiedMandate,
          rootDir,
        })
      : resolveContextFiles(rootDir, dag, [], {
          verifiedMandate: opts.verifiedMandate,
          rootDir,
        });

  // Import closure capped by hops; seed paths are the ticket/bond set.
  const closure = collectImportClosure(rootDir, seedPaths, hops);
  const allowed = new Set(closure);
  for (const p of seedPaths) allowed.add(p);

  // Escape guard: drop anything outside ticket ∪ import closure.
  let paths = [...allowed].filter((p) => !p.includes("..")).sort();
  if (paths.length > maxFiles) {
    paths = paths.slice(0, maxFiles);
  }

  const digests = paths.map((p) => fileDigest(rootDir, p));
  const cacheKey = computeContextPackCacheKey({
    paths,
    hops,
    charBudget,
    digests,
    ticket_id: opts.ticket_id,
  });

  if (useCache) {
    const mem = memoryCache.get(cacheKey);
    if (mem) {
      return { ...mem.pack, graph_cache_hit: true, built_at: mem.built_at };
    }
    const disk = readDiskCache(rootDir, cacheKey);
    if (disk) {
      memoryCache.set(cacheKey, { pack: disk, built_at: disk.built_at });
      return { ...disk, graph_cache_hit: true };
    }
  }

  const nodes: ContextPackNode[] = [];
  const edges: ContextPackEdge[] = [];
  const boundSet = new Set(seedPaths);

  for (const file of paths) {
    const nodeId = `file:${file}`;
    nodes.push({ id: nodeId, kind: "file", path: file });
    if (boundSet.has(file)) {
      edges.push({
        from: "ticket",
        to: nodeId,
        kind: "bound",
      });
    }
  }

  // Import edges within closure only
  for (const file of paths) {
    const abs = path.join(rootDir, file);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, "utf8");
    const dir = path.dirname(file);
    for (const match of content.matchAll(IMPORT_RE)) {
      const importPath = match[1];
      if (!importPath?.startsWith(".")) continue;
      const candidate = resolveLocalImport(rootDir, dir, importPath);
      if (!candidate || !allowed.has(candidate)) continue;
      edges.push({
        from: `file:${file}`,
        to: `file:${candidate}`,
        kind: "imports",
      });
    }
  }

  const prefixes = paths.map((p) => {
    const dir = path.dirname(p);
    return dir === "." ? p : `${dir}/`;
  });
  const recall = recallLessons(rootDir, prefixes.length ? prefixes : ["src/"], 8);
  const lessons: ContextPackLesson[] = recall.lessons
    .filter((lesson) => {
      // Lesson must touch ticket∪closure path
      return (
        paths.some(
          (p) =>
            lesson.path === p ||
            p.startsWith(lesson.path) ||
            lesson.path.startsWith(path.dirname(p)),
        ) ||
        lesson.reuseWhen.some((rw) => paths.some((p) => p.startsWith(rw) || rw.startsWith(p)))
      );
    })
    .map((lesson) => {
      const nodeId = `lesson:${lesson.id}`;
      nodes.push({
        id: nodeId,
        kind: "lesson",
        lesson_id: lesson.id,
        path: lesson.path,
      });
      const target =
        paths.find((p) => p === lesson.path || p.startsWith(lesson.path)) ??
        paths[0];
      if (target) {
        edges.push({
          from: nodeId,
          to: `file:${target}`,
          kind: "lesson_on",
        });
      }
      return {
        id: lesson.id,
        path: lesson.path,
        failureClass: lesson.failureClass,
        reuseWhen: lesson.reuseWhen,
        gate_id: lesson.gate_id,
        symptom: lesson.symptom,
        fix: lesson.fix,
      };
    });

  for (const gate of loadReleaseGates()) {
    const gatePaths = gate.files.map((f) => f.path);
    if (!paths.some((p) => gatePaths.includes(p))) continue;
    const nodeId = `gate:${gate.id}`;
    nodes.push({ id: nodeId, kind: "gate", gate_id: gate.id });
    for (const gp of gatePaths) {
      if (!paths.includes(gp)) continue;
      edges.push({
        from: nodeId,
        to: `file:${gp}`,
        kind: "gate_matches",
      });
    }
  }

  // Char budget: when allowLlm, assemble capped file content into digests only
  // (pack stores graph; text bundle built separately for agents).
  if (allowLlm) {
    buildContextBundle(rootDir, paths, {
      maxTotalChars: charBudget,
      maxPerFileChars: maxPerFile,
    });
  }

  const pack: ContextPack = parseContextPack({
    version: CONTEXT_PACK_VERSION,
    ...(opts.ticket_id ? { ticket_id: opts.ticket_id } : {}),
    root: path.resolve(rootDir),
    paths,
    nodes,
    edges,
    lessons,
    char_budget: charBudget,
    hops,
    cache_key: cacheKey,
    built_at: now(),
  });

  if (useCache) {
    memoryCache.set(cacheKey, { pack, built_at: pack.built_at });
    writeDiskCache(rootDir, pack);
  }

  return pack;
}

/** Format ContextPack + legacy text bundle for agents (backward compatible). */
export function formatContextPackBundle(
  rootDir: string,
  pack: ContextPack,
  opts?: { maxPerFileChars?: number },
): {
  pack: ContextPack;
  files: Array<{ path: string; content: string; contentHash: string }>;
  totalChars: number;
  truncated: boolean;
} {
  const bundle = buildContextBundle(rootDir, pack.paths, {
    maxTotalChars: pack.char_budget,
    maxPerFileChars: opts?.maxPerFileChars ?? 4000,
  });
  return {
    pack,
    files: bundle.files,
    totalChars: bundle.totalChars,
    truncated: bundle.truncated,
  };
}
