import { describe, expect, it } from "vitest";
import { createInitialOSContext } from "./machine.js";
import {
  createOSPlayer,
  getPersistedSnapshot,
  isTerminalSnapshot,
} from "./player.js";

describe("OS player capsule", () => {
  it("rehydrates a non-terminal snapshot", () => {
    const context = {
      ...createInitialOSContext(),
      issueNumber: "200",
      attempts: 2,
      maxAttempts: 3,
    };

    const cold = createOSPlayer(context);
    cold.send({ type: "preflight.completed", findings: [] });
    cold.send({
      type: "plan.created",
      dag: {
        issueNumber: "200",
        title: "Resume",
        nodes: [
          {
            id: "edit-1",
            title: "Edit",
            kind: "edit" as const,
            dependsOn: [],
            risk: "low" as const,
            files: ["src/resume.ts"],
            acceptance: ["tests pass"],
          },
        ],
      },
    });
    cold.send({
      type: "risk.reviewed",
      risk: "low",
      reason: "safe",
    });

    const snapshot = getPersistedSnapshot(cold);
    expect(isTerminalSnapshot(snapshot)).toBe(false);

    const resumed = createOSPlayer(context, { snapshot });
    expect(resumed.getSnapshot().value).toBe("generating_patch");
    expect(resumed.getSnapshot().context.dag?.issueNumber).toBe("200");
    expect(isTerminalSnapshot(getPersistedSnapshot(resumed))).toBe(false);
  });
});
