import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { createOSMachine } from "./machine.js";

describe("vibe engine OS machine", () => {
  it("pauses for approval when risk review marks a change high risk", () => {
    const actor = createActor(createOSMachine()).start();

    actor.send({ type: "preflight.completed", findings: [] });
    actor.send({
      type: "plan.created",
      dag: {
        issueNumber: "1",
        title: "Workflow edit",
        nodes: [
          {
            id: "edit-workflow",
            title: "Edit workflow",
            kind: "edit",
            dependsOn: [],
            risk: "high",
            files: [".github/workflows/forever.yml"],
            acceptance: ["workflow parses"],
          },
        ],
      },
    });
    actor.send({
      type: "risk.reviewed",
      risk: "high",
      reason: "Protected workflow edit",
    });

    expect(actor.getSnapshot().value).toBe("awaiting_approval");
    expect(actor.getSnapshot().context.risk).toBe("high");
  });

  it("continues to patch generation when risk is low", () => {
    const actor = createActor(createOSMachine()).start();

    actor.send({ type: "preflight.completed", findings: [] });
    actor.send({
      type: "plan.created",
      dag: {
        issueNumber: "2",
        title: "Safe source edit",
        nodes: [
          {
            id: "edit-source",
            title: "Edit source",
            kind: "edit",
            dependsOn: [],
            risk: "low",
            files: ["src/index.ts"],
            acceptance: ["tests pass"],
          },
        ],
      },
    });
    actor.send({
      type: "risk.reviewed",
      risk: "low",
      reason: "Generated source-only edit",
    });

    expect(actor.getSnapshot().value).toBe("generating_patch");
  });

  it("records verification failure and moves into learning", () => {
    const actor = createActor(createOSMachine()).start();

    actor.send({ type: "preflight.completed", findings: [] });
    actor.send({
      type: "plan.created",
      dag: { issueNumber: "3", title: "Compile fix", nodes: [] },
    });
    actor.send({
      type: "risk.reviewed",
      risk: "low",
      reason: "No protected files",
    });
    actor.send({
      type: "patch.generated",
      files: [{ path: "src/index.ts", content: "export const x = 1;" }],
    });
    actor.send({
      type: "verification.failed",
      failure: {
        failureClass: "compile",
        symptom: "Missing .js import extension",
        output: "TS2835",
      },
    });

    expect(actor.getSnapshot().value).toBe("learning");
    expect(actor.getSnapshot().context.failures).toHaveLength(1);
  });
});
