import type { ExecutionDag, ExecutionDagNode, RiskLevel } from "../os/events.js";

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

export function riskForFiles(files: string[]): RiskLevel {
  if (files.some((file) => file.startsWith(".github/"))) return "high";
  if (
    files.some(
      (file) =>
        file === "package.json" ||
        file === "package-lock.json" ||
        file.endsWith(".lock"),
    )
  ) {
    return "medium";
  }
  return "low";
}

function hasCycle(nodes: ExecutionDagNode[]) {
  try {
    topologicalSort(nodes);
    return false;
  } catch {
    return true;
  }
}
