import { defineCatalog } from "@xmachines/play-catalog";
import { z } from "zod";

const riskLevel = z.enum(["low", "medium", "high"]);

const dagNodeKind = z.enum([
  "research",
  "edit",
  "test",
  "verify",
  "publish",
  "learn",
]);

export const executionDagNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: dagNodeKind,
  dependsOn: z.array(z.string()),
  risk: riskLevel,
  files: z.array(z.string()),
  acceptance: z.array(z.string()),
});

export const executionDagSchema = z.object({
  issueNumber: z.string().min(1),
  title: z.string().min(1),
  nodes: z.array(executionDagNodeSchema).min(1),
});

export const gateFailureSchema = z.object({
  status: z.literal("gate_failed"),
  gate_id: z.string().min(1),
  analysis: z.object({
    path: z.string(),
    detail: z.string(),
  }),
  remediation_instruction: z.string(),
});

export const runMetricsSchema = z.object({
  tokensEstimate: z.number().optional(),
  attempts: z.number().int().nonnegative(),
  firstPassGreen: z.boolean(),
  gateIdsFailed: z.array(z.string()),
  durationMs: z.number().nonnegative(),
});

export const vowAttestationSchema = z.object({
  vowsVersion: z.string().min(1),
  vowsHash: z.string().min(1),
  attestedAt: z.string().datetime(),
});

export const mandateViolationSchema = z.object({
  path: z.string(),
  rule: z.enum(["forbidden", "require_approval"]),
  prefix: z.string(),
});

export const mandateEvalSchema = z.object({
  passed: z.boolean(),
  violations: z.array(mandateViolationSchema),
  requiresApproval: z.boolean(),
  maxAttempts: z.number().int().positive(),
});

export const bondPolicySchema = z.object({
  require_bound_files_min_depth: z.number().int().min(0).max(5),
  max_bound_files: z.number().int().positive(),
  max_intent_chars: z.number().int().positive(),
  allowed_file_prefixes: z.array(z.string()),
});

export const taskBondSchema = z.object({
  issueNumber: z.string().min(1),
  issueTitle: z.string(),
  intent: z.string().min(1).max(500),
  outcomes: z.array(z.string()),
  boundFiles: z.array(z.string()),
  constraints: z.array(z.string()),
  depth: z.number().int().min(0).max(5),
  bondHash: z.string().min(1),
  sealedAt: z.string().datetime(),
});

export const taskBondViolationSchema = z.object({
  rule: z.enum([
    "missing_bound_files",
    "too_many_bound_files",
    "intent_too_long",
    "forbidden_prefix",
    "require_approval",
    "disallowed_prefix",
    "missing_intent",
  ]),
  path: z.string().optional(),
  detail: z.string(),
});

export const taskBondEvalSchema = z.object({
  passed: z.boolean(),
  violations: z.array(taskBondViolationSchema),
  mandateEval: mandateEvalSchema,
  requiresApproval: z.boolean(),
});

export const runManifestSchema = z.object({
  runId: z.string().min(1),
  issueNumber: z.string().min(1),
  issueTitle: z.string(),
  branchName: z.string(),
  baseSha: z.string(),
  generatedFiles: z.array(z.string()),
  generatedFileDigests: z.record(z.string(), z.string()).optional(),
  createdAt: z.string().datetime(),
  approvalRequired: z.boolean().optional(),
  vowsHash: z.string().optional(),
  bondHash: z.string().optional(),
  capsuleHash: z.string().optional(),
  metrics: runMetricsSchema.optional(),
});

export const scoreboardEntrySchema = z.object({
  runId: z.string().min(1),
  issueNumber: z.string().min(1),
  issueTitle: z.string(),
  success: z.boolean(),
  state: z.string(),
  createdAt: z.string().datetime(),
  metrics: runMetricsSchema,
});

export const mandatesSchema = z.object({
  forbidden_prefixes: z.array(z.string()),
  require_approval_prefixes: z.array(z.string()),
  max_attempts: z.number().int().positive(),
  approved_operators: z.array(z.string()).optional(),
  bond: bondPolicySchema.optional(),
});

export const receivedPhaseSchema = z.object({
  issueNumber: z.string(),
  issueTitle: z.string().optional(),
});

export const preflightPhaseSchema = z.object({
  findingsCount: z.number().int().nonnegative(),
});

export const planningPhaseSchema = z.object({
  nodeCount: z.number().int().nonnegative(),
  issueNumber: z.string(),
});

export const riskReviewPhaseSchema = z.object({
  risk: riskLevel,
  reason: z.string(),
  approvalRequired: z.boolean().optional(),
});

export const awaitingApprovalPhaseSchema = z.object({
  risk: riskLevel.optional(),
  reason: z.string().optional(),
});

export const generatingPatchPhaseSchema = z.object({
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
});

export const verifyingPhaseSchema = z.object({
  fileCount: z.number().int().nonnegative(),
});

export const learningPhaseSchema = z.object({
  failureCount: z.number().int().nonnegative(),
});

export const publishingPhaseSchema = z.object({
  previewUrl: z.string().optional(),
});

export const completedPhaseSchema = z.object({
  runId: z.string().optional(),
});

export const failedPhaseSchema = z.object({
  reason: z.string().optional(),
});

export const constitutionCatalog = defineCatalog({
  ExecutionDag: executionDagSchema,
  GateFailure: gateFailureSchema,
  VowAttestation: vowAttestationSchema,
  TaskBond: taskBondSchema,
  TaskBondEval: taskBondEvalSchema,
  RunManifest: runManifestSchema,
  ScoreboardEntry: scoreboardEntrySchema,
  MandateEval: mandateEvalSchema,
  Mandates: mandatesSchema,
  BondPolicy: bondPolicySchema,
  ReceivedPhase: receivedPhaseSchema,
  PreflightPhase: preflightPhaseSchema,
  PlanningPhase: planningPhaseSchema,
  RiskReviewPhase: riskReviewPhaseSchema,
  AwaitingApprovalPhase: awaitingApprovalPhaseSchema,
  GeneratingPatchPhase: generatingPatchPhaseSchema,
  VerifyingPhase: verifyingPhaseSchema,
  LearningPhase: learningPhaseSchema,
  PublishingPhase: publishingPhaseSchema,
  CompletedPhase: completedPhaseSchema,
  FailedPhase: failedPhaseSchema,
});
