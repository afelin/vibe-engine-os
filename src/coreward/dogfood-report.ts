#!/usr/bin/env npx tsx
/**
 * Local dogfood scoreboard: operator-metrics + last savings attest.
 * Exit 0 on pass / incomplete data; exit 1 when thresholds clearly fail.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadMetrics,
  preflightCompliancePct,
  toCommentMarkdown,
} from "./operator-metrics.js";

const COMPLIANCE_TARGET = 80;

type AttestShape = {
  summary?: {
    graphCacheHits?: number;
    runsWithMetrics?: number;
    gateHits?: number;
    totalContextChars?: number;
  };
  generatedAt?: string;
  createdAt?: string;
  built_at?: string;
  runCount?: number;
};

function loadAttest(cwd: string): AttestShape | null {
  const p = join(cwd, ".vibe", "savings-attestation.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as AttestShape;
  } catch {
    return null;
  }
}

function main(): void {
  const cwd = process.cwd();
  const metrics = loadMetrics(cwd);
  const pct = preflightCompliancePct(metrics);
  const attest = loadAttest(cwd);

  const lines: string[] = [
    "# Coreward dogfood report",
    "",
    toCommentMarkdown(metrics).trim(),
    "",
    "## Preflight compliance kill criterion",
    "",
  ];

  let exit = 0;
  if (pct === null) {
    lines.push(
      `- Compliance %: **n/a** (no sessions with preflight yet). Target ≥${COMPLIANCE_TARGET}%.`,
    );
  } else if (pct >= COMPLIANCE_TARGET) {
    lines.push(`- Compliance %: **${pct}%** — pass (≥${COMPLIANCE_TARGET}%).`);
  } else {
    lines.push(
      `- Compliance %: **${pct}%** — FAIL (target ≥${COMPLIANCE_TARGET}%). Demote “agents call preflight” narrative until hook/dogfood recovers.`,
    );
    exit = 1;
  }

  lines.push("", "## Last savings attestation", "");
  if (!attest) {
    lines.push("- No `.vibe/savings-attestation.json` — run `npm run savings:attest`.");
  } else {
    const when = attest.generatedAt ?? attest.createdAt ?? attest.built_at ?? "unknown";
    lines.push(`- Updated: ${when}`);
    lines.push(`- Runs: ${attest.runCount ?? attest.summary?.runsWithMetrics ?? "—"}`);
    lines.push(`- Gate hits: ${attest.summary?.gateHits ?? "—"}`);
    lines.push(`- Graph cache hits: ${attest.summary?.graphCacheHits ?? "—"}`);
  }

  lines.push("");
  process.stdout.write(lines.join("\n"));
  process.exit(exit);
}

main();
