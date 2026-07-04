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
  findings: PreflightFinding[];
  dag?: ExecutionDag;
  generatedFiles: GeneratedFile[];
  verificationResults: VerificationResult[];
  failures: ClassifiedFailure[];
};

export type OSEvent =
  | { type: "os.received"; source: "github" | "cloudflare"; payload: unknown }
  | { type: "preflight.completed"; findings: PreflightFinding[] }
  | { type: "plan.created"; dag: ExecutionDag }
  | { type: "risk.reviewed"; risk: RiskLevel; reason: string }
  | { type: "approval.granted"; actor: string }
  | { type: "patch.generated"; files: GeneratedFile[] }
  | { type: "verification.passed"; results: VerificationResult[] }
  | { type: "verification.failed"; failure: ClassifiedFailure }
  | { type: "learning.recorded"; lessonIds: string[] }
  | { type: "publish.completed"; prUrl?: string; previewUrl?: string };
