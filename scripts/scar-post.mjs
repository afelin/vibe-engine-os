#!/usr/bin/env node
/**
 * Export L0 heal win (preferred) or last gauntlet/launch-proof as a GTM scar-post snippet.
 * Stakeholder narratives delegate to src/publishing/stakeholder-narratives.ts (zero-LLM).
 */
import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const narrativesModule = path.join(
  root,
  "src/publishing/stakeholder-narratives.ts",
);

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

function readActiveLegalSpace() {
  const stackPath = path.join(root, ".vibe/active-stack.json");
  if (!fs.existsSync(stackPath)) return undefined;
  try {
    const stack = JSON.parse(fs.readFileSync(stackPath, "utf8"));
    return typeof stack.legalSpace === "string" ? stack.legalSpace : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Delegate to shared TypeScript renderer via tsx (ESM + zero-LLM templates).
 */
function renderSharedNarrativesSection(manifest) {
  if (!fs.existsSync(narrativesModule)) return "";

  const vibeDir = path.join(root, ".vibe");
  fs.mkdirSync(vibeDir, { recursive: true });
  const payloadPath = path.join(vibeDir, "_stakeholder-narratives-input.json");
  const runnerPath = path.join(vibeDir, "_stakeholder-narratives-runner.mts");
  fs.writeFileSync(payloadPath, `${JSON.stringify(manifest)}\n`, "utf8");
  fs.writeFileSync(
    runnerPath,
    `import * as fs from "node:fs";
import {
  formatStakeholderNarrativesSection,
  renderStakeholderNarratives,
} from "../src/publishing/stakeholder-narratives.ts";

const manifest = JSON.parse(fs.readFileSync(${JSON.stringify(payloadPath)}, "utf8"));
process.stdout.write(
  formatStakeholderNarrativesSection(renderStakeholderNarratives(manifest)),
);
`,
    "utf8",
  );

  try {
    const tsxCli = path.join(root, "node_modules/tsx/dist/cli.mjs");
    if (!fs.existsSync(tsxCli)) return "";
    return execFileSync(process.execPath, [tsxCli, runnerPath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  } finally {
    try {
      fs.unlinkSync(runnerPath);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(payloadPath);
    } catch {
      // ignore
    }
  }
}

function narrativesManifestFromArtifacts({ l0Win, proof }) {
  const legalSpace = readActiveLegalSpace();
  if (l0Win) {
    return {
      runId: l0Win.runId,
      issueNumber: l0Win.issueNumber,
      issueTitle: l0Win.issueTitle,
      success: l0Win.success === true,
      state: l0Win.state,
      metrics: l0Win.metrics,
      legalSpace,
      rootDir: root,
    };
  }
  if (proof) {
    return {
      runId: proof.runId || `launch-proof-${proof.issueNumber ?? "unknown"}`,
      issueNumber:
        proof.issueNumber !== undefined ? String(proof.issueNumber) : undefined,
      capsuleHash: proof.capsuleHash,
      vowsHash: proof.vowsHash,
      success: proof.checksGreen === true,
      state: "completed",
      legalSpace,
      rootDir: root,
    };
  }
  return null;
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

  const narrManifest = narrativesManifestFromArtifacts({ l0Win, proof });
  if (narrManifest) {
    const section = renderSharedNarrativesSection(narrManifest);
    if (section) {
      lines.push("", section, "");
    }
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
