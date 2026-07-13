import { describe, expect, it } from "vitest";
import {
  DECISION_CATALOG,
  renderDecisionExplain,
  resolveExplainDepth,
} from "./explain.js";

describe("resolveExplainDepth", () => {
  it("prefers VIBE_EXPLAIN over labels and repo var", () => {
    expect(
      resolveExplainDepth({
        env: {
          VIBE_EXPLAIN: "long",
          VIBE_LABELS: "vibe:explain-short",
          VIBE_EXPLAIN_REPO: "expand",
        },
      }),
    ).toBe("long");
  });

  it("uses explain labels when env unset", () => {
    expect(
      resolveExplainDepth({
        env: { VIBE_LABELS: "vibe/run, vibe:explain-expand" },
      }),
    ).toBe("expand");
  });

  it("uses repo var when env and labels unset", () => {
    expect(
      resolveExplainDepth({
        env: { VIBE_EXPLAIN_REPO: "long" },
      }),
    ).toBe("long");
  });

  it("defaults to off for agent runs and short otherwise", () => {
    expect(resolveExplainDepth({ env: {} })).toBe("short");
    expect(resolveExplainDepth({ env: { CURSOR_AGENT: "1" } })).toBe("off");
  });
});

describe("renderDecisionExplain", () => {
  it("returns empty for off depth", () => {
    expect(renderDecisionExplain("launch.readiness", "off")).toBe("");
  });

  it("renders tiered copy for known decisions", () => {
    const short = renderDecisionExplain("operator.approve", "short");
    expect(short).toContain("Why this matters");
    expect(short).toContain("/approve");

    const long = renderDecisionExplain("launch.proof", "long");
    const expand = renderDecisionExplain("launch.proof", "expand");
    expect(long.length).toBeGreaterThan(short.length);
    expect(expand.length).toBeGreaterThan(long.length);
    expect(long).toContain("zero-token");
  });

  it("covers launch and operator catalog ids", () => {
    const ids = [
      "launch.readiness",
      "launch.proof",
      "launch.branch_protection",
      "operator.approve",
      "operator.auto_merge",
      "operator.receipt",
    ];
    for (const id of ids) {
      expect(DECISION_CATALOG[id]).toBeDefined();
      expect(renderDecisionExplain(id, "short").length).toBeGreaterThan(0);
    }
  });
});
