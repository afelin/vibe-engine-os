import type { AnyStateMachine } from "xstate";
import { getSuccessors } from "@statelyai/graph";
import { machineToGraph } from "@xmachines/play-router";

type StateNodeMeta = {
  phase?: string;
  route?: string;
};

export type CrawlResult = {
  visitedStateIds: string[];
  phases: string[];
};

/**
 * Walk the machine transition graph and collect visited state ids plus meta.phase values.
 * Mirrors the crawlMachine helper referenced in the xmachines headless Play plan.
 */
export function crawlMachine(machine: AnyStateMachine): CrawlResult {
  const phases = new Set<string>();
  const declaredStateIds: string[] = [];

  for (const [stateKey, stateNode] of Object.entries(machine.states)) {
    declaredStateIds.push(stateKey);
    const phase = (stateNode as { meta?: StateNodeMeta }).meta?.phase;
    if (typeof phase === "string") {
      phases.add(phase);
    }
  }

  const graph = machineToGraph(machine);
  const graphVisited = new Set<string>();
  const queue = [machine.id];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (graphVisited.has(nodeId)) continue;
    graphVisited.add(nodeId);

    for (const successor of getSuccessors(graph, nodeId)) {
      if (!graphVisited.has(successor.id)) {
        queue.push(successor.id);
      }
    }
  }

  return {
    visitedStateIds: [...new Set([...declaredStateIds, ...graphVisited])],
    phases: [...phases].sort(),
  };
}

export function collectMachineStateKeys(
  machine: AnyStateMachine,
): string[] {
  const keys: string[] = [];
  const walk = (states: Record<string, unknown>, prefix = "") => {
    for (const [key, value] of Object.entries(states)) {
      const path = prefix ? `${prefix}.${key}` : key;
      keys.push(path);
      if (value && typeof value === "object" && "states" in value) {
        const nested = (value as { states?: Record<string, unknown> }).states;
        if (nested) walk(nested, path);
      }
    }
  };

  walk(machine.states as Record<string, unknown>);
  return keys;
}

function shortStateId(stateKey: string): string {
  const dot = stateKey.lastIndexOf(".");
  return dot === -1 ? stateKey : stateKey.slice(dot + 1);
}

export function renderOsPhasesMarkdown(
  machine: AnyStateMachine,
  title = "OS Promotion Phases",
): string {
  const rows = Object.entries(machine.states as Record<string, { meta?: StateNodeMeta }>)
    .map(([stateKey, stateNode]) => {
      const shortKey = shortStateId(stateKey);
      const meta = stateNode.meta ?? {};
      const phase = meta.phase ?? shortKey;
      const route = meta.route ?? "";
      return `| ${phase} | \`${shortKey}\` | \`${route}\` |`;
    })
    .sort();

  return [
    `# ${title}`,
    "",
    "Auto-generated from `extractMachineRoutes` / machine meta. Do not edit by hand.",
    "",
    "| Phase | State ID | Route |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
