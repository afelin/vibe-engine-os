import { describe, expect, it } from "vitest";
import {
  riskForFiles,
  topologicalSort,
  validateDag,
} from "./dag.js";
import type { ExecutionDagNode } from "../os/events.js";

describe("execution DAG", () => {
  it("rejects missing dependencies", () => {
    const errors = validateDag({
      issueNumber: "1",
      title: "Bad DAG",
      nodes: [
        node({
          id: "test",
          title: "Run tests",
          kind: "test",
          dependsOn: ["missing"],
        }),
      ],
    });

    expect(errors).toContain("Node test depends on missing node missing");
  });

  it("rejects dependency cycles", () => {
    const errors = validateDag({
      issueNumber: "1",
      title: "Cycle DAG",
      nodes: [
        node({ id: "a", title: "A", dependsOn: ["b"] }),
        node({ id: "b", title: "B", dependsOn: ["a"] }),
      ],
    });

    expect(errors).toContain("DAG contains a dependency cycle");
  });

  it("sorts nodes topologically", () => {
    const sorted = topologicalSort([
      node({ id: "verify", title: "Verify", kind: "verify", dependsOn: ["edit"] }),
      node({ id: "edit", title: "Edit", kind: "edit", dependsOn: [] }),
      node({
        id: "publish",
        title: "Publish",
        kind: "publish",
        dependsOn: ["verify"],
      }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "edit",
      "verify",
      "publish",
    ]);
  });

  it("marks workflow edits high risk", () => {
    expect(riskForFiles([".github/workflows/forever.yml"])).toBe("high");
  });

  it("marks package mutations medium risk", () => {
    expect(riskForFiles(["package.json"])).toBe("medium");
    expect(riskForFiles(["package-lock.json"])).toBe("medium");
  });

  it("marks ordinary source edits low risk", () => {
    expect(riskForFiles(["src/index.ts"])).toBe("low");
  });
});

function node(overrides: Partial<ExecutionDagNode>): ExecutionDagNode {
  return {
    id: "node",
    title: "Node",
    kind: "edit",
    dependsOn: [],
    risk: "low",
    files: [],
    acceptance: ["complete"],
    ...overrides,
  };
}
