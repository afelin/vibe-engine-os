import { z } from "zod";
import {
  constitutionCatalog,
  executionDagSchema,
  gateFailureSchema,
  mandateEvalSchema,
  mandatesSchema,
  runManifestSchema,
  scoreboardEntrySchema,
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

export function exportCatalogJsonSchema(): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(constitutionCatalog)) {
    schemas[name] = z.toJSONSchema(schema as z.ZodType);
  }
  return schemas;
}
