#!/usr/bin/env node
/**
 * Export last gauntlet regression or gate failure as a GTM scar-post snippet.
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

function formatScarPost({ proof, gauntletOutput }) {
  const lines = [
    "## Scar post snippet (vibe-engine-os)",
    "",
  ];

  if (proof) {
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
  } else if (proof) {
    lines.push(
      "### Hook",
      "",
      "Zero-token issue → PR + tamper-evident receipt. No terminal. Promotion only when the capsule validates.",
      "",
    );
  } else {
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

const proof = readLaunchProof();
const gauntletOutput = runGauntletCapture();
const markdown = formatScarPost({ proof, gauntletOutput });

process.stdout.write(`${markdown}\n`);

const outPath = path.join(root, ".vibe/scar-post.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${markdown}\n`, "utf8");
process.stderr.write(`Wrote ${outPath}\n`);
