#!/usr/bin/env node
/**
 * Export L0 heal win (preferred) or last gauntlet/launch-proof as a GTM scar-post snippet.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();

function readLaunchProof() {
  const proofPath = path.join(root, ".vibe/launch-proof.json");
  if (!fs.existsSync(proofPath)) return null;
  return JSON.parse(fs.readFileSync(proofPath, "utf8"));
}

/** Newest scoreboard row with deterministicFix + healed L0. */
function readL0HealWin() {
  const scoreboardPath = path.join(root, ".runs", "scoreboard.ndjson");
  if (!fs.existsSync(scoreboardPath)) return null;
  const lines = fs
    .readFileSync(scoreboardPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      const metrics = entry.metrics ?? {};
      if (
        entry.success === true &&
        metrics.deterministicFix === true &&
        metrics.healLevel === 0
      ) {
        return entry;
      }
    } catch {
      // skip malformed rows
    }
  }
  return null;
}

function runGauntletCapture() {
  try {
    execSync("npm run eval:bond", {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
    });
    return null;
  } catch (error) {
    const output =
      (error instanceof Error && "stdout" in error
        ? String(error.stdout ?? "")
        : "") +
      (error instanceof Error && "stderr" in error
        ? String(error.stderr ?? "")
        : "");
    return output.trim() || "Gauntlet failed — run npm run eval:bond for details";
  }
}

function formatScarPost({ l0Win, proof, gauntletOutput }) {
  const lines = [
    "## Scar post snippet (vibe-engine-os)",
    "",
  ];

  if (l0Win) {
    const m = l0Win.metrics ?? {};
    lines.push(
      `**L0 heal win:** \`${l0Win.runId}\` — ${l0Win.issueTitle || "troubleshoot"}`,
      `**Deterministic:** yes · **healLevel:** 0 · **slot:** \`${m.agentSlot ?? "unknown"}\``,
      l0Win.state ? `**State:** ${l0Win.state}` : "",
      "",
      "### Hook",
      "",
      "Zero-token L0 heal from scoreboard — no agent slot burned. Promote the pattern into classify/feedback cache.",
      "",
    );
  } else if (proof) {
    lines.push(
      `**Launch proof:** issue #${proof.issueNumber} → [PR](${proof.prUrl})`,
      proof.capsuleHash ? `**Capsule:** \`sha256:${proof.capsuleHash}\`` : "",
      proof.checksGreen ? "**Checks:** Vibe Promotion Gate green" : "",
      "",
    );
  }

  if (gauntletOutput) {
    lines.push(
      "### Gauntlet block",
      "",
      "The constitution blocked a forbidden path before it reached `main`:",
      "",
      "```",
      gauntletOutput.split("\n").slice(-8).join("\n"),
      "```",
      "",
    );
  } else if (!l0Win && proof) {
    lines.push(
      "### Hook",
      "",
      "Zero-token issue → PR + tamper-evident receipt. No terminal. Promotion only when the capsule validates.",
      "",
    );
  } else if (!l0Win && !proof) {
    lines.push(
      "### Hook",
      "",
      "Run `npm run launch:readiness` and `workflow_dispatch` launch-proof first.",
      "Then re-run `npm run launch:scar` for artifact-backed copy.",
      "",
    );
  }

  lines.push(
    "---",
    "Templates: docs/go-to-market.md · Runbook: docs/launch-proof.md",
  );

  return lines.filter(Boolean).join("\n");
}

const l0Win = readL0HealWin();
const proof = l0Win ? null : readLaunchProof();
const gauntletOutput = runGauntletCapture();
const markdown = formatScarPost({ l0Win, proof, gauntletOutput });

process.stdout.write(`${markdown}\n`);

const outPath = path.join(root, ".vibe/scar-post.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${markdown}\n`, "utf8");
process.stderr.write(`Wrote ${outPath}\n`);
