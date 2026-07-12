import type { ExecutionDag, ExecutionDagNode, RiskLevel } from "../os/events.js";
import { parseExecutionDag } from "../constitution/parse.js";
import {
  evaluateMandates,
  loadMandates,
  type Mandates,
} from "../policy/evaluate.js";

export function validateDag(dag: ExecutionDag): string[] {
  const errors: string[] = [];
  const ids = new Set(dag.nodes.map((item) => item.id));

  for (const item of dag.nodes) {
    for (const dependency of item.dependsOn) {
      if (!ids.has(dependency)) {
        errors.push(`Node ${item.id} depends on missing node ${dependency}`);
      }
    }
  }

  if (hasCycle(dag.nodes)) {
    errors.push("DAG contains a dependency cycle");
  }

  return errors;
}

export function validateAndParseDag(dag: ExecutionDag): ExecutionDag {
  const errors = validateDag(dag);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return parseExecutionDag(dag);
}

export function topologicalSort(nodes: ExecutionDagNode[]) {
  const remaining = new Map(nodes.map((item) => [item.id, item]));
  const completed = new Set<string>();
  const sorted: ExecutionDagNode[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((item) =>
      item.dependsOn.every((dependency) => completed.has(dependency)),
    );

    if (ready.length === 0) {
      throw new Error("Cannot sort cyclic DAG");
    }

    for (const item of ready) {
      sorted.push(item);
      completed.add(item.id);
      remaining.delete(item.id);
    }
  }

  return sorted;
}

export function riskForFiles(files: string[], mandates: Mandates = loadMandates()): RiskLevel {
  const review = resolveRiskReview(files, mandates);
  return review.risk;
}

export function resolveRiskReview(
  files: string[],
  mandates: Mandates = loadMandates(),
): { risk: RiskLevel; reason: string; approvalRequired: boolean } {
  const mandateEval = evaluateMandates(files, mandates);
  if (!mandateEval.passed) {
    return {
      risk: "high",
      reason: "Forbidden path in planned files",
      approvalRequired: false,
    };
  }

  const hasWorkflow = files.some((file) => file.startsWith(".github/"));
  const hasPackageMutation = files.some(
    (file) =>
      file === "package.json" ||
      file === "package-lock.json" ||
      file.endsWith(".lock"),
  );

  if (mandateEval.requiresApproval || hasWorkflow) {
    return {
      risk: "high",
      reason: mandateEval.requiresApproval
        ? "Mandate requires approval for protected path"
        : "Protected workflow or high-risk path in planned files",
      approvalRequired: true,
    };
  }

  if (hasPackageMutation) {
    return {
      risk: "medium",
      reason: "Package manifest mutation in planned files",
      approvalRequired: false,
    };
  }

  return {
    risk: "low",
    reason: "Generated source-only edit",
    approvalRequired: false,
  };
}

export function collectPlannedFiles(dag: ExecutionDag): string[] {
  return [...new Set(dag.nodes.flatMap((node) => node.files))];
}

export function parsePlannerDag(raw: string, fallback: ExecutionDag): ExecutionDag {
  try {
    const parsed = JSON.parse(raw) as Partial<ExecutionDag>;
    if (!parsed.nodes || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      return fallback;
    }
    return {
      issueNumber: parsed.issueNumber ?? fallback.issueNumber,
      title: parsed.title ?? fallback.title,
      nodes: parsed.nodes as ExecutionDagNode[],
    };
  } catch {
    return fallback;
  }
}

function hasCycle(nodes: ExecutionDagNode[]) {
  try {
    topologicalSort(nodes);
    return false;
  } catch {
    return true;
  }
}
