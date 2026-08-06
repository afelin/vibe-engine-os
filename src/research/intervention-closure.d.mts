export type InterventionStage = "candidate" | "kept" | "dropped";

export type InterventionDelta = {
  firstPassGreenDelta: number;
  l0l1HealShareDelta: number;
  tokensMedianDelta: number;
};

export type InterventionFollowUp = {
  owner: "operator" | "engineer" | "policy";
  action: string;
  dueBy: string;
};

export type InterventionRecord = {
  id: string;
  changedFiles: string[];
  diffHash: string;
  recordedAt: string;
  stage?: InterventionStage;
  stageReason?: string;
  followUp?: InterventionFollowUp;
  legalSpace?: string;
};

export type InterventionFollowUpRecord = {
  interventionId: string;
  owner: InterventionFollowUp["owner"];
  action: string;
  dueBy: string;
  stage?: InterventionStage;
  emittedAt: string;
  legalSpace?: string;
};

export type WeeklyClosureResult = {
  stage: InterventionStage;
  reason: string;
  updated: number;
  followUps: InterventionFollowUpRecord[];
};

export function readAllInterventions(rootDir: string): InterventionRecord[];
export function writeAllInterventions(
  rootDir: string,
  records: InterventionRecord[],
): void;
export function defaultFollowUpForStage(
  stage: InterventionStage,
  now?: Date,
): InterventionFollowUp;
export function stageReasonFromDelta(
  stage: InterventionStage,
  delta: InterventionDelta,
): string;
export function evaluateInterventionStage(
  delta: InterventionDelta,
): InterventionStage;
export function updateInterventionStage(
  rootDir: string,
  id: string,
  stage: InterventionStage,
  reason: string,
): InterventionRecord | null;
export function assignInterventionFollowUp(
  rootDir: string,
  id: string,
  followUp: InterventionFollowUp,
): InterventionRecord | null;
export function emitFollowUps(rootDir: string): InterventionFollowUpRecord[];
export function applyWeeklyInterventionClosure(
  rootDir: string,
  delta: InterventionDelta | null | undefined,
): WeeklyClosureResult;
