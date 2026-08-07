import { describe, expect, it, vi } from "vitest";
import {
  renderCockpitComment,
  renderGauntletLine,
  renderTokensSavedLine,
  resolveNextAction,
  shouldExpandTechnical,
} from "./cockpit.js";
import type { OSContext } from "../os/events.js";

const baseContext = {
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
      failureClass: "compile" as const,
      symptom: "Missing .js import extension",
      output: "TS2835",
    },
  ],
} satisfies OSContext;

describe("operator cockpit", () => {
  it("renders plain-language block with technical details collapsed", () => {
    const text = renderCockpitComment("learning", baseContext);

    expect(text).toContain("## Coreward");
    expect(text).toContain("### What's happening");
    expect(text).toContain("### Next step");
    expect(text).toContain("### Outcome checklist");
    expect(text).toContain("<details>");
    expect(text).toContain("Technical details");
    expect(text).toContain("/continue");
    expect(text).toContain("/details");
    expect(text).toContain("src/index.ts");
    expect(text).toContain("compile: Missing .js import extension");
  });

  it("expands technical details for /details and vibe:technical", () => {
    const fromDetails = renderCockpitComment("learning", baseContext, ".", undefined, {
      commandBody: "/details",
      expandTechnical: true,
    });
    expect(fromDetails).toContain("<details open>");

    expect(
      shouldExpandTechnical("vibe/run, vibe:technical", undefined),
    ).toBe(true);
    expect(shouldExpandTechnical("vibe/run", "/status")).toBe(false);
  });

  it("includes explain block when depth is long via env", () => {
    vi.stubEnv("VIBE_EXPLAIN", "long");
    const text = renderCockpitComment(
      "awaiting_approval",
      baseContext,
      ".",
      undefined,
      { labels: "vibe/run" },
    );
    expect(text).toContain("Why this matters");
    expect(text).toContain("/approve");
    vi.unstubAllEnvs();
  });

  it("maps machine states to deterministic next actions", () => {
    expect(resolveNextAction("awaiting_approval")).toContain("/approve");
    expect(resolveNextAction("completed")).toContain("merge");
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
        metrics: { firstPassGreen: true },
      },
    );

    expect(text).toContain("sha256:abc123");
    expect(text).toContain("View proof");
    expect(text).toContain("run=run-1");
    expect(text).toContain("validate_capsule");
    expect(text).toContain("Scoreboard");
    expect(text).toContain("This run first-pass");
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

    expect(text.indexOf("Open PR")).toBeLessThan(text.indexOf("### What's happening"));
    expect(text).toContain("https://github.com/owner/repo/pull/99");
  });

  it("shows receipt and gauntlet in plain block when capsule exists", () => {
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
        metrics: { firstPassGreen: true, tokensEstimate: 0 },
      },
    );

    const detailsIndex = text.indexOf("<details>");
    expect(text.indexOf("Receipt verified")).toBeLessThan(detailsIndex);
    expect(text.indexOf("View proof")).toBeLessThan(detailsIndex);
    expect(text.indexOf("Gauntlet:")).toBeLessThan(detailsIndex);
    expect(text).toContain("zero-token gate path");
  });

  it("shows savings line with gate_hit / contextChars / tokensEstimate", () => {
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
        metrics: {
          firstPassGreen: true,
          tokensEstimate: 0,
          contextChars: 1200,
          gateHit: true,
        },
      },
    );
    expect(text).toContain("gate_hit=yes");
    expect(text).toContain("contextChars=1200");
    expect(text).toContain("tokensEstimate=0");
  });

  it("renders gauntlet and tokens saved helpers", () => {
    expect(renderGauntletLine(".")).toMatch(/\*\*Gauntlet:\*\* \d+\/\d+ green/);
    expect(
      renderTokensSavedLine({
        runId: "run-1",
        metrics: { firstPassGreen: true, tokensEstimate: 0 },
      }),
    ).toContain("4000 tokens");
  });
});
