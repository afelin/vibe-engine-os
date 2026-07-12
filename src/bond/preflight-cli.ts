#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { readRunManifest } from "../run/manifest.js";
import { readTaskBond } from "./store.js";

const rootDir = process.argv[2] ?? ".";
const issueNumber = process.argv[3] ?? process.env.ISSUE_NUMBER ?? "";
const runId = process.argv[4] ?? process.env.RUN_ID ?? "";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function runGauntlet(): void {
  try {
    execSync("npm run eval:bond", {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    record("taskbond.gauntlet", true);
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: string }).stdout ?? "")
        : error instanceof Error
          ? error.message
          : String(error);
    record("taskbond.gauntlet", false, message.slice(0, 300));
  }
}

function checkBondForIssue(): void {
  if (!issueNumber) {
    record("bond.issue_file", true, "skipped (no issue number)");
    return;
  }
  if (runId) {
    const manifest = readRunManifest(rootDir, runId);
    if (manifest && !manifest.bondHash) {
      record(
        "bond.issue_file",
        true,
        "skipped (legacy manifest without bondHash)",
      );
      return;
    }
  }
  const bond = readTaskBond(rootDir, issueNumber);
  record(
    "bond.issue_file",
    bond !== null,
    bond ? bond.bondHash : `missing .runs/bonds/issue-${issueNumber}.bond.json`,
  );
}

function checkManifestBond(runIdValue: string): void {
  if (!runIdValue) {
    record("bond.manifest_hash", true, "skipped (no run id)");
    return;
  }
  const manifest = readRunManifest(rootDir, runIdValue);
  if (!manifest) {
    record("bond.manifest_hash", false, "manifest not found");
    return;
  }
  if (!manifest.bondHash) {
    record("bond.manifest_hash", true, "no bondHash on manifest (legacy run)");
    return;
  }
  const bond = issueNumber
    ? readTaskBond(rootDir, issueNumber)
    : readTaskBond(rootDir, manifest.issueNumber);
  const match = bond?.bondHash === manifest.bondHash;
  record(
    "bond.manifest_hash",
    match,
    match ? manifest.bondHash : `manifest=${manifest.bondHash} bond=${bond?.bondHash ?? "missing"}`,
  );
}

function checkCapsule(runIdValue: string): void {
  if (!runIdValue) {
    record("capsule.validate", true, "skipped (no run id)");
    return;
  }
  try {
    execSync(`npm run gate:validate-capsule -- "${rootDir}" "${runIdValue}"`, {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    record("capsule.validate", true, runIdValue);
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? "")
        : "validate-capsule failed";
    record("capsule.validate", false, message.slice(0, 200));
  }
}

runGauntlet();
checkBondForIssue();
checkManifestBond(runId);
checkCapsule(runId);

const failed = checks.filter((c) => !c.ok);
for (const check of checks) {
  const mark = check.ok ? "ok" : "FAIL";
  console.log(`[${mark}] ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
}

if (failed.length > 0) {
  process.exit(1);
}
