/**
 * Local Savings Attestation — hash-chained JSON from run/cockpit metrics.
 * Metrics: gate_hit, contextChars, tokensEstimate (same fields as cockpit Savings).
 * Hosted verify of attestations remains unclaimed (see claim ledger hosted_hpurl).
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalize } from "../constitution/capsule.js";
import {
  readRunManifest,
  readScoreboardEntries,
  type RunManifest,
  type ScoreboardEntry,
} from "../run/manifest.js";
import { resolveRunDir } from "../run/paths.js";

export const SAVINGS_ATTESTATION_SCHEMA = "coreward.savings_attestation.v1" as const;
export const DEFAULT_ATTESTATION_REL = ".vibe/savings-attestation.json";

export type SavingsRunMetrics = {
  gateHit?: boolean;
  contextChars?: number;
  tokensEstimate?: number;
  firstPassGreen?: boolean;
  /** ContextPack served from cache. */
  graphCacheHit?: boolean;
  /** Import hops used for ContextPack. */
  hops?: number;
  /** Lesson was absorbed into a gate candidate / prefer_gate path. */
  gateAbsorbedLesson?: boolean;
};

export type SavingsRunLink = {
  runId: string;
  createdAt?: string;
  metrics: SavingsRunMetrics;
  /** sha256 of canonicalize({ prevHash, runId, metrics, createdAt }) */
  entryHash: string;
  prevHash: string | null;
};

export type SavingsAttestation = {
  schema: typeof SAVINGS_ATTESTATION_SCHEMA;
  generatedAt: string;
  rootHint: string;
  runCount: number;
  summary: {
    gateHits: number;
    totalContextChars: number;
    totalTokensEstimate: number;
    runsWithMetrics: number;
    graphCacheHits: number;
  };
  chain: SavingsRunLink[];
  /** Tip of the hash chain (last entryHash), or null if empty. */
  tipHash: string | null;
};

export type BuildAttestationOptions = {
  rootDir?: string;
  /** Explicit run ids (manifests). When empty, use scoreboard + any listed manifests. */
  runIds?: string[];
  /** Max scoreboard rows when discovering runs (default 50). */
  scoreboardLimit?: number;
  now?: () => string;
};

function resolveGateHit(m: SavingsRunMetrics): boolean | undefined {
  if (m.gateHit !== undefined) return m.gateHit;
  if (m.tokensEstimate === 0 && m.firstPassGreen === true) return true;
  return undefined;
}

export function pickSavingsMetrics(
  metrics?: {
    gateHit?: boolean;
    contextChars?: number;
    tokensEstimate?: number;
    firstPassGreen?: boolean;
    graphCacheHit?: boolean;
    hops?: number;
    gateAbsorbedLesson?: boolean;
  } | null,
): SavingsRunMetrics {
  if (!metrics) return {};
  const out: SavingsRunMetrics = {};
  const gateHit = resolveGateHit({
    gateHit: metrics.gateHit,
    tokensEstimate: metrics.tokensEstimate,
    firstPassGreen: metrics.firstPassGreen,
  });
  if (gateHit !== undefined) out.gateHit = gateHit;
  if (typeof metrics.contextChars === "number") {
    out.contextChars = metrics.contextChars;
  }
  if (typeof metrics.tokensEstimate === "number") {
    out.tokensEstimate = metrics.tokensEstimate;
  }
  if (metrics.firstPassGreen !== undefined) {
    out.firstPassGreen = metrics.firstPassGreen;
  }
  if (metrics.graphCacheHit !== undefined) {
    out.graphCacheHit = metrics.graphCacheHit;
  }
  if (typeof metrics.hops === "number") {
    out.hops = metrics.hops;
  }
  if (metrics.gateAbsorbedLesson !== undefined) {
    out.gateAbsorbedLesson = metrics.gateAbsorbedLesson;
  }
  return out;
}

export function hashSavingsEntry(input: {
  prevHash: string | null;
  runId: string;
  metrics: SavingsRunMetrics;
  createdAt?: string;
}): string {
  const body = {
    prevHash: input.prevHash,
    runId: input.runId,
    metrics: input.metrics,
    createdAt: input.createdAt ?? null,
  };
  return crypto
    .createHash("sha256")
    .update(canonicalize(body), "utf8")
    .digest("hex");
}

export function verifySavingsChain(chain: SavingsRunLink[]): boolean {
  let prev: string | null = null;
  for (const link of chain) {
    if (link.prevHash !== prev) return false;
    const expected = hashSavingsEntry({
      prevHash: link.prevHash,
      runId: link.runId,
      metrics: link.metrics,
      createdAt: link.createdAt,
    });
    if (expected !== link.entryHash) return false;
    prev = link.entryHash;
  }
  return true;
}

function metricsFromManifest(manifest: RunManifest): SavingsRunMetrics {
  return pickSavingsMetrics(manifest.metrics);
}

function metricsFromScoreboard(entry: ScoreboardEntry): SavingsRunMetrics {
  return pickSavingsMetrics(entry.metrics);
}

function collectRunSources(
  rootDir: string,
  runIds: string[] | undefined,
  scoreboardLimit: number,
): Array<{ runId: string; createdAt?: string; metrics: SavingsRunMetrics }> {
  const byId = new Map<
    string,
    { runId: string; createdAt?: string; metrics: SavingsRunMetrics }
  >();

  const scoreboard = readScoreboardEntries(rootDir, scoreboardLimit);
  for (const entry of scoreboard) {
    byId.set(entry.runId, {
      runId: entry.runId,
      createdAt: entry.createdAt,
      metrics: metricsFromScoreboard(entry),
    });
  }

  // Discover run dirs when scoreboard is thin / empty
  const runsRoot = path.join(rootDir, ".runs");
  if (fs.existsSync(runsRoot)) {
    for (const name of fs.readdirSync(runsRoot)) {
      if (name.startsWith(".")) continue;
      const manifestPath = path.join(runsRoot, name, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      if (!byId.has(name)) {
        const manifest = readRunManifest(rootDir, name);
        if (manifest) {
          byId.set(name, {
            runId: name,
            createdAt: manifest.createdAt,
            metrics: metricsFromManifest(manifest),
          });
        }
      }
    }
  }

  const ids =
    runIds && runIds.length > 0
      ? runIds
      : [...byId.keys()];

  for (const runId of ids) {
    const manifest = readRunManifest(rootDir, runId);
    if (manifest) {
      const metrics = metricsFromManifest(manifest);
      const hasAny =
        metrics.gateHit !== undefined ||
        typeof metrics.contextChars === "number" ||
        typeof metrics.tokensEstimate === "number" ||
        metrics.graphCacheHit !== undefined ||
        typeof metrics.hops === "number";
      if (hasAny || !byId.has(runId)) {
        byId.set(runId, {
          runId,
          createdAt: manifest.createdAt,
          metrics: hasAny ? metrics : byId.get(runId)?.metrics ?? metrics,
        });
      }
    } else if (runIds?.includes(runId) && !byId.has(runId)) {
      const dir = resolveRunDir(rootDir, runId);
      if (!fs.existsSync(dir)) continue;
    }
  }

  const ordered =
    runIds && runIds.length > 0
      ? runIds
          .map((id) => byId.get(id))
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
      : [...byId.values()].sort((a, b) =>
          (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
        );

  return ordered.filter((row) => {
    const m = row.metrics;
    return (
      m.gateHit !== undefined ||
      typeof m.contextChars === "number" ||
      typeof m.tokensEstimate === "number" ||
      m.graphCacheHit !== undefined ||
      typeof m.hops === "number"
    );
  });
}

export function buildSavingsAttestation(
  options: BuildAttestationOptions = {},
): SavingsAttestation {
  const rootDir = path.resolve(options.rootDir ?? ".");
  const now = options.now ?? (() => new Date().toISOString());
  const sources = collectRunSources(
    rootDir,
    options.runIds,
    options.scoreboardLimit ?? 50,
  );

  const chain: SavingsRunLink[] = [];
  let prevHash: string | null = null;
  let gateHits = 0;
  let totalContextChars = 0;
  let totalTokensEstimate = 0;
  let graphCacheHits = 0;

  for (const src of sources) {
    const metrics = pickSavingsMetrics(src.metrics);
    const entryHash = hashSavingsEntry({
      prevHash,
      runId: src.runId,
      metrics,
      createdAt: src.createdAt,
    });
    chain.push({
      runId: src.runId,
      createdAt: src.createdAt,
      metrics,
      entryHash,
      prevHash,
    });
    if (metrics.gateHit === true) gateHits++;
    if (metrics.graphCacheHit === true) graphCacheHits++;
    if (typeof metrics.contextChars === "number") {
      totalContextChars += metrics.contextChars;
    }
    if (typeof metrics.tokensEstimate === "number") {
      totalTokensEstimate += metrics.tokensEstimate;
    }
    prevHash = entryHash;
  }

  return {
    schema: SAVINGS_ATTESTATION_SCHEMA,
    generatedAt: now(),
    rootHint: path.basename(rootDir),
    runCount: chain.length,
    summary: {
      gateHits,
      totalContextChars,
      totalTokensEstimate,
      runsWithMetrics: chain.length,
      graphCacheHits,
    },
    chain,
    tipHash: prevHash,
  };
}

export function writeSavingsAttestation(
  rootDir: string,
  attestation: SavingsAttestation,
  relativePath = DEFAULT_ATTESTATION_REL,
): string {
  const outPath = path.resolve(rootDir, relativePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
  return outPath;
}

export function buildAndWriteSavingsAttestation(
  options: BuildAttestationOptions & { relativePath?: string } = {},
): { attestation: SavingsAttestation; path: string } {
  const rootDir = path.resolve(options.rootDir ?? ".");
  const attestation = buildSavingsAttestation(options);
  const written = writeSavingsAttestation(
    rootDir,
    attestation,
    options.relativePath ?? DEFAULT_ATTESTATION_REL,
  );
  return { attestation, path: written };
}
