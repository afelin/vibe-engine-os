import { describe, expect, it } from "vitest";
import {
  ConstitutionParseError,
  exportCatalogJsonSchema,
  parseExecutionDag,
  parseGateFailure,
  parseGateFailures,
  parseMandateEval,
  parseMandates,
  parseRunManifest,
  parseScoreboardEntry,
  parseVowAttestation,
} from "./parse.js";

describe("constitution catalog", () => {
  it("accepts a valid execution DAG", () => {
    const dag = parseExecutionDag({
      issueNumber: "42",
      title: "Add trace spans",
      nodes: [
        {
          id: "edit-1",
          title: "Implement trace",
          kind: "edit",
          dependsOn: [],
          risk: "low",
          files: ["src/os/trace.ts"],
          acceptance: ["tests pass"],
        },
      ],
    });

    expect(dag.nodes).toHaveLength(1);
    expect(dag.nodes[0]?.files).toContain("src/os/trace.ts");
  });

  it("rejects malformed planner output", () => {
    expect(() =>
      parseExecutionDag({
        issueNumber: "42",
        title: "Missing nodes",
        nodes: [],
      }),
    ).toThrow(ConstitutionParseError);
  });

  it("validates gate failure artifacts", () => {
    const failure = parseGateFailure({
      status: "gate_failed",
      gate_id: "vitest",
      analysis: { path: "tests", detail: "expected true" },
      remediation_instruction: "Fix failing tests.",
    });

    expect(failure.gate_id).toBe("vitest");
    expect(parseGateFailures([failure])).toHaveLength(1);
  });

  it("validates run manifest and scoreboard entries", () => {
    const manifest = parseRunManifest({
      runId: "issue-1-2026",
      issueNumber: "1",
      issueTitle: "Smoke",
      branchName: "main",
      baseSha: "abc123",
      generatedFiles: ["src/index.ts"],
      createdAt: "2026-07-04T00:00:00.000Z",
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        gateIdsFailed: [],
        durationMs: 12,
      },
    });

    expect(manifest.runId).toBe("issue-1-2026");

    const entry = parseScoreboardEntry({
      runId: manifest.runId,
      issueNumber: "1",
      issueTitle: "Smoke",
      success: true,
      state: "completed",
      createdAt: manifest.createdAt,
      metrics: manifest.metrics!,
    });

    expect(entry.state).toBe("completed");
  });

  it("validates mandate eval and mandates config", () => {
    const mandates = parseMandates({
      forbidden_prefixes: ["src/auth/"],
      require_approval_prefixes: [".github/"],
      max_attempts: 3,
    });

    const evaluation = parseMandateEval({
      passed: false,
      violations: [
        { path: "src/auth/session.ts", rule: "forbidden", prefix: "src/auth/" },
      ],
      requiresApproval: false,
      maxAttempts: mandates.max_attempts,
    });

    expect(evaluation.passed).toBe(false);
  });

  it("validates vow attestation", () => {
    const attestation = parseVowAttestation({
      vowsVersion: "1.0.0",
      vowsHash: "abc123",
      attestedAt: "2026-07-04T00:00:00.000Z",
    });
    expect(attestation.vowsVersion).toBe("1.0.0");
  });

  it("exports JSON Schema for every catalog entry", () => {
    const schemas = exportCatalogJsonSchema();
    expect(Object.keys(schemas).sort()).toEqual(
      [
        "AwaitingApprovalPhase",
        "CompletedPhase",
        "ExecutionDag",
        "FailedPhase",
        "GateFailure",
        "GeneratingPatchPhase",
        "LearningPhase",
        "MandateEval",
        "Mandates",
        "PlanningPhase",
        "PreflightPhase",
        "PublishingPhase",
        "ReceivedPhase",
        "RiskReviewPhase",
        "RunManifest",
        "ScoreboardEntry",
        "VowAttestation",
        "VerifyingPhase",
      ].sort(),
    );
    expect(schemas.ExecutionDag).toMatchObject({ type: "object" });
  });
});
