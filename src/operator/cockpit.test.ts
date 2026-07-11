import { describe, expect, it } from "vitest";
import { renderCockpitComment } from "./cockpit.js";
import type { OSContext } from "../os/events.js";

describe("operator cockpit", () => {
  it("renders state, files, failures, rollback, and commands", () => {
    const text = renderCockpitComment("learning", {
      issueNumber: "7",
      issueTitle: "Fix compile failure",
      issueBody: "Please fix it",
      attempts: 2,
      maxAttempts: 3,
      risk: "medium",
      riskReason: "Package mutation",
      findings: [],
      generatedFiles: [{ path: "src/index.ts", content: "export {};" }],
      verificationResults: [],
      failures: [
        {
          failureClass: "compile",
          symptom: "Missing .js import extension",
          output: "TS2835",
        },
      ],
    } satisfies OSContext);

    expect(text).toContain("Vibe Engine OS Cockpit");
    expect(text).toContain("learning");
    expect(text).toContain("#7 Fix compile failure");
    expect(text).toContain("medium");
    expect(text).toContain("src/index.ts");
    expect(text).toContain("compile: Missing .js import extension");
    expect(text).toContain("/approve");
    expect(text).toContain("/rollback");
  });

  it("renders depth in cockpit status", () => {
    const text = renderCockpitComment("learning", {
      issueNumber: "7",
      issueTitle: "Fix compile failure",
      issueBody: "Please fix it",
      attempts: 2,
      maxAttempts: 3,
      risk: "medium",
      riskReason: "Package mutation",
      vibeDepth: 3,
      findings: [],
      generatedFiles: [{ path: "src/index.ts", content: "export {};" }],
      verificationResults: [],
      failures: [],
    } satisfies OSContext);

    expect(text).toContain("Vibe Depth");
    expect(text).toContain("tests + implementation");
  });
});
