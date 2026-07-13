export type RiskLevel = "low" | "medium" | "high";

export type PreflightFinding = {
  kind: "memory" | "repo" | "dependency" | "policy";
  summary: string;
  confidence: number;
};

export type GeneratedFile = {
  path: string;
  content: string;
};

export type VerificationResult = {
  name: string;
  passed: boolean;
  output: string;
};

export type FailureClass =
  | "compile"
  | "test"
  | "dependency"
  | "api_drift"
  | "permission"
  | "cloud_deploy"
  | "model_output"
  | "invariant"
  | "operator_intent";

export type ClassifiedFailure = {
  failureClass: FailureClass;
  symptom: string;
  output: string;
};

export type DagNodeKind =
  | "research"
  | "edit"
  | "test"
  | "verify"
  | "publish"
  | "learn";

export type ExecutionDagNode = {
  id: string;
  title: string;
  kind: DagNodeKind;
  dependsOn: string[];
  risk: RiskLevel;
  files: string[];
  acceptance: string[];
};

export type ExecutionDag = {
  issueNumber: string;
  title: string;
  nodes: ExecutionDagNode[];
};

export type OSContext = {
  issueNumber: string;
  issueTitle: string;
  issueBody: string;
  attempts: number;
  maxAttempts: number;
  risk?: RiskLevel;
  riskReason?: string;
  approvalRequired?: boolean;
  vibeDepth?: number;
  plan?: string;
  releaseGateId?: string;
  findings: PreflightFinding[];
  dag?: ExecutionDag;
  generatedFiles: GeneratedFile[];
  verificationResults: VerificationResult[];
  failures: ClassifiedFailure[];
};

/**
 * OSEvent follows the xmachines PlayEvent contract: every event has a `type`
 * string plus a typed payload. External ingress (GitHub webhooks, MCP tools,
 * operator commands) should normalize into these shapes before send().
 */
export type PlayCompatibleEvent = {
  type: string;
} & Record<string, unknown>;

export type OSEvent =
  | { type: "os.received"; source: "github" | "cloudflare"; payload: unknown }
  | { type: "preflight.completed"; findings: PreflightFinding[] }
  | { type: "plan.created"; dag: ExecutionDag }
  | { type: "risk.reviewed"; risk: RiskLevel; reason: string; approvalRequired?: boolean }
  | { type: "approval.granted"; actor: string; commentId?: string }
  | { type: "attempt.started"; attempt: number }
  | { type: "patch.generated"; files: GeneratedFile[] }
  | { type: "verification.passed"; results: VerificationResult[] }
  | { type: "verification.failed"; failure: ClassifiedFailure }
  | { type: "learning.recorded"; lessonIds: string[] }
  | { type: "codegen.retry" }
  | { type: "publish.completed"; prUrl?: string; previewUrl?: string }
  | {
      type:
        | "operator.plan_requested"
        | "operator.retry_requested"
        | "operator.rollback_requested"
        | "operator.status_requested"
        | "operator.deploy_requested"
        | "operator.continue_requested"
        | "operator.details_requested";
      protocolVersion: "os.operator.v1";
      actor: string;
      commentId: string;
    };

export function normalizeOsReceivedEvent(input: {
  source: "github" | "cloudflare";
  payload: unknown;
}): Extract<OSEvent, { type: "os.received" }> {
  return {
    type: "os.received",
    source: input.source,
    payload: input.payload,
  };
}
