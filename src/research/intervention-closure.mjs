import * as fs from "node:fs";
import * as path from "node:path";

/** @typedef {"candidate" | "kept" | "dropped"} InterventionStage */

/**
 * @typedef {{
 *   firstPassGreenDelta: number;
 *   l0l1HealShareDelta: number;
 *   tokensMedianDelta: number;
 * }} InterventionDelta
 */

/**
 * @typedef {{
 *   owner: "operator" | "engineer" | "policy";
 *   action: string;
 *   dueBy: string;
 * }} InterventionFollowUp
 */

/**
 * @typedef {{
 *   id: string;
 *   changedFiles: string[];
 *   diffHash: string;
 *   recordedAt: string;
 *   stage?: InterventionStage;
 *   stageReason?: string;
 *   followUp?: InterventionFollowUp;
 *   legalSpace?: string;
 * }} InterventionRecord
 */

/**
 * @typedef {{
 *   interventionId: string;
 *   owner: InterventionFollowUp["owner"];
 *   action: string;
 *   dueBy: string;
 *   stage?: InterventionStage;
 *   emittedAt: string;
 *   legalSpace?: string;
 * }} InterventionFollowUpRecord
 */

const INTERVENTIONS_FILE = "interventions.ndjson";
const FOLLOWUPS_FILE = "intervention-followups.ndjson";
const TERMINAL_STAGES = /** @type {const} */ (["kept", "dropped"]);

function interventionsPath(rootDir) {
  return path.join(rootDir, ".runs", INTERVENTIONS_FILE);
}

function followUpsPath(rootDir) {
  return path.join(rootDir, ".runs", FOLLOWUPS_FILE);
}

export function readAllInterventions(rootDir) {
  const filePath = interventionsPath(rootDir);
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => /** @type {InterventionRecord} */ (JSON.parse(line)));
}

export function writeAllInterventions(rootDir, records) {
  const dir = path.join(rootDir, ".runs");
  fs.mkdirSync(dir, { recursive: true });
  const body =
    records.length === 0
      ? ""
      : `${records.map((row) => JSON.stringify(row)).join("\n")}\n`;
  fs.writeFileSync(interventionsPath(rootDir), body, "utf8");
}

function isOpenIntervention(record) {
  return !record.stage || record.stage === "candidate";
}

function daysFromNow(days, now = new Date()) {
  const due = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return due.toISOString();
}

/**
 * @param {InterventionStage} stage
 * @param {Date} [now]
 * @returns {InterventionFollowUp}
 */
export function defaultFollowUpForStage(stage, now = new Date()) {
  if (stage === "kept") {
    return {
      owner: "operator",
      action: "Retain intervention; document outcome in EVOMEM",
      dueBy: daysFromNow(7, now),
    };
  }
  if (stage === "dropped") {
    return {
      owner: "engineer",
      action: "Revert or replace dropped intervention",
      dueBy: daysFromNow(3, now),
    };
  }
  return {
    owner: "policy",
    action: "Monitor next weekly delta before promoting change",
    dueBy: daysFromNow(14, now),
  };
}

/**
 * @param {InterventionStage} stage
 * @param {InterventionDelta} delta
 */
export function stageReasonFromDelta(stage, delta) {
  return (
    `weeklyDelta → ${stage} ` +
    `(firstPass=${delta.firstPassGreenDelta}, ` +
    `l0l1=${delta.l0l1HealShareDelta}, ` +
    `tokens=${delta.tokensMedianDelta})`
  );
}

/**
 * Weekly Pearl decision:
 * - kept: quality up (firstPass + L0/L1 share) and cost down (tokens median)
 * - dropped: quality down and cost up
 * - candidate: inconclusive / mixed signal
 * @param {InterventionDelta} delta
 * @returns {InterventionStage}
 */
export function evaluateInterventionStage(delta) {
  const qualityUp = delta.firstPassGreenDelta > 0 && delta.l0l1HealShareDelta > 0;
  const qualityDown = delta.firstPassGreenDelta < 0 && delta.l0l1HealShareDelta < 0;
  const costDown = delta.tokensMedianDelta < 0;
  const costUp = delta.tokensMedianDelta > 0;

  if (qualityUp && costDown) return "kept";
  if (qualityDown && costUp) return "dropped";
  return "candidate";
}

/**
 * @param {string} rootDir
 * @param {string} id
 * @param {InterventionStage} stage
 * @param {string} reason
 */
export function updateInterventionStage(rootDir, id, stage, reason) {
  const records = readAllInterventions(rootDir);
  const index = records.findIndex((row) => row.id === id);
  if (index < 0) return null;

  const updated = {
    ...records[index],
    stage,
    stageReason: reason,
  };
  records[index] = updated;
  writeAllInterventions(rootDir, records);
  return updated;
}

/**
 * @param {string} rootDir
 * @param {string} id
 * @param {InterventionFollowUp} followUp
 */
export function assignInterventionFollowUp(rootDir, id, followUp) {
  const records = readAllInterventions(rootDir);
  const index = records.findIndex((row) => row.id === id);
  if (index < 0) return null;

  const updated = {
    ...records[index],
    followUp: {
      owner: followUp.owner,
      action: followUp.action,
      dueBy: followUp.dueBy,
    },
  };
  records[index] = updated;
  writeAllInterventions(rootDir, records);
  return updated;
}

/**
 * Snapshot follow-ups from the interventions ledger into intervention-followups.ndjson.
 * @param {string} rootDir
 * @returns {InterventionFollowUpRecord[]}
 */
export function emitFollowUps(rootDir) {
  const now = new Date().toISOString();
  const records = readAllInterventions(rootDir)
    .filter((row) => row.followUp)
    .map((row) => {
      const followUp = row.followUp;
      /** @type {InterventionFollowUpRecord} */
      const out = {
        interventionId: row.id,
        owner: followUp.owner,
        action: followUp.action,
        dueBy: followUp.dueBy,
        emittedAt: now,
      };
      if (row.stage) out.stage = row.stage;
      if (row.legalSpace) out.legalSpace = row.legalSpace;
      return out;
    });

  const dir = path.join(rootDir, ".runs");
  fs.mkdirSync(dir, { recursive: true });
  const body =
    records.length === 0
      ? ""
      : `${records.map((row) => JSON.stringify(row)).join("\n")}\n`;
  fs.writeFileSync(followUpsPath(rootDir), body, "utf8");
  return records;
}

/**
 * Apply weeklyDelta classification to open interventions (missing stage or candidate),
 * assign owner/action follow-ups, and emit follow-up snapshot.
 * @param {string} rootDir
 * @param {InterventionDelta | null | undefined} delta
 */
export function applyWeeklyInterventionClosure(rootDir, delta) {
  if (!delta) {
    return {
      stage: /** @type {InterventionStage} */ ("candidate"),
      reason: "no weeklyDelta",
      updated: 0,
      followUps: emitFollowUps(rootDir),
    };
  }

  const stage = evaluateInterventionStage(delta);
  const reason = stageReasonFromDelta(stage, delta);
  const followUp = defaultFollowUpForStage(stage);
  const records = readAllInterventions(rootDir);
  let updated = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (TERMINAL_STAGES.includes(/** @type {any} */ (row.stage))) continue;
    if (!isOpenIntervention(row)) continue;

    records[i] = {
      ...row,
      stage,
      stageReason: reason,
      followUp,
    };
    updated += 1;
  }

  if (updated > 0) {
    writeAllInterventions(rootDir, records);
  }

  return {
    stage,
    reason,
    updated,
    followUps: emitFollowUps(rootDir),
  };
}
