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

  it("renders capsule hash and scoreboard when manifest provided", () => {
    const text = renderCockpitComment(
      "completed",
      {
        issueNumber: "1",
        issueTitle: "Done",
        issueBody: "",
        attempts: 1,
        maxAttempts: 3,
        findings: [],
        generatedFiles: [],
        verificationResults: [],
        failures: [],
      } satisfies OSContext,
      ".",
      {
        runId: "run-1",
        capsuleHash: "abc123",
        vowsHash: "vows456",
      },
    );

    expect(text).toContain("sha256:abc123");
    expect(text).toContain("View proof");
    expect(text).toContain("run=run-1");
    expect(text).toContain("validate_capsule");
    expect(text).toContain("Scoreboard");
  });

  it("embeds repository in receipt link when provided", () => {
    const text = renderCockpitComment(
      "completed",
      {
        issueNumber: "1",
        issueTitle: "Done",
        issueBody: "",
        attempts: 1,
        maxAttempts: 3,
        findings: [],
        generatedFiles: [],
        verificationResults: [],
        failures: [],
      } satisfies OSContext,
      ".",
      {
        runId: "run-1",
        capsuleHash: "abc123",
        vowsHash: "vows456",
        repository: "afelin/vibe-engine-os",
        proofBase: "https://proof.test/v",
      },
    );

    expect(text).toContain("repo=afelin%2Fvibe-engine-os");
    expect(text).toContain("https://proof.test/v#?");
  });

  it("renders PR link at top when manifest includes prUrl", () => {
    const text = renderCockpitComment(
      "completed",
      {
        issueNumber: "42",
        issueTitle: "Ship feature",
        issueBody: "",
        attempts: 1,
        maxAttempts: 3,
        findings: [],
        generatedFiles: [],
        verificationResults: [],
        failures: [],
      } satisfies OSContext,
      ".",
      {
        runId: "run-1",
        prUrl: "https://github.com/owner/repo/pull/99",
      },
    );

    expect(text.indexOf("Open pull request")).toBeLessThan(text.indexOf("**State:**"));
    expect(text).toContain("https://github.com/owner/repo/pull/99");
  });
});
