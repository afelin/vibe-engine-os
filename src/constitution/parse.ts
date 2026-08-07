import { z } from "zod";
import {
  constitutionCatalog,
  evoLessonSchema,
  executionDagSchema,
  gateFailureSchema,
  gateFeedbackEntrySchema,
  healResultSchema,
  mandateEvalSchema,
  mandatesSchema,
  principalsFileSchema,
  signedMandateSchema,
  wardDecisionSchema,
  orchestratorIntentSchema,
  recallResultSchema,
  runManifestSchema,
  scopedContextBundleSchema,
  scoreboardEntrySchema,
  taskBondEvalSchema,
  taskBondSchema,
  troubleshootPacketSchema,
  vowAttestationSchema,
} from "./catalog.js";

export class ConstitutionParseError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = "ConstitutionParseError";
    this.issues = issues;
  }
}

function parseWith<T>(label: string, schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => issue.message).join("; ");
    throw new ConstitutionParseError(`${label}: ${detail}`, result.error.issues);
  }
  return result.data;
}

export function parseExecutionDag(data: unknown) {
  return parseWith("ExecutionDag", executionDagSchema, data);
}

export function parseGateFailure(data: unknown) {
  return parseWith("GateFailure", gateFailureSchema, data);
}

export function parseGateFailures(data: unknown) {
  return parseWith("GateFailure[]", z.array(gateFailureSchema), data);
}

export function parseRunManifest(data: unknown) {
  return parseWith("RunManifest", runManifestSchema, data);
}

export function parseVowAttestation(data: unknown) {
  return parseWith("VowAttestation", vowAttestationSchema, data);
}

export function parseScoreboardEntry(data: unknown) {
  return parseWith("ScoreboardEntry", scoreboardEntrySchema, data);
}

export function parseMandateEval(data: unknown) {
  return parseWith("MandateEval", mandateEvalSchema, data);
}

export function parseMandates(data: unknown) {
  return parseWith("Mandates", mandatesSchema, data);
}

export function parseSignedMandate(data: unknown) {
  return parseWith("SignedMandate", signedMandateSchema, data);
}

export function parseWardDecision(data: unknown) {
  return parseWith("WardDecision", wardDecisionSchema, data);
}

export function parsePrincipalsFile(data: unknown) {
  return parseWith("PrincipalsFile", principalsFileSchema, data);
}

export function parseTaskBond(data: unknown) {
  return parseWith("TaskBond", taskBondSchema, data);
}

export function parseTaskBondEval(data: unknown) {
  return parseWith("TaskBondEval", taskBondEvalSchema, data);
}

export function parseScopedContextBundle(data: unknown) {
  return parseWith("ScopedContextBundle", scopedContextBundleSchema, data);
}

export function parseEvoLesson(data: unknown) {
  return parseWith("EvoLesson", evoLessonSchema, data);
}

export function parseRecallResult(data: unknown) {
  return parseWith("RecallResult", recallResultSchema, data);
}

export function parseGateFeedbackEntry(data: unknown) {
  return parseWith("GateFeedbackEntry", gateFeedbackEntrySchema, data);
}

export function parseOrchestratorIntent(data: unknown) {
  return parseWith("OrchestratorIntent", orchestratorIntentSchema, data);
}

export function parseTroubleshootPacket(data: unknown) {
  return parseWith("TroubleshootPacket", troubleshootPacketSchema, data);
}

export function parseHealResult(data: unknown) {
  return parseWith("HealResult", healResultSchema, data);
}

export function exportCatalogJsonSchema(): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(constitutionCatalog)) {
    schemas[name] = z.toJSONSchema(schema as z.ZodType);
  }
  return schemas;
}
