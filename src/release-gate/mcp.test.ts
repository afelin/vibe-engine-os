import { describe, expect, it } from "vitest";
import {
  callReleaseGateTool,
  handleMcpRequest,
  RELEASE_GATE_TOOLS,
} from "./mcp-handlers.js";
import { computeVowsHash } from "../constitution/vows.js";

describe("release gate MCP handlers", () => {
  it("advertises eight deterministic tools", () => {
    expect(RELEASE_GATE_TOOLS.map((tool) => tool.name)).toEqual([
      "list_gates",
      "resolve_gate",
      "preview_gate",
      "evaluate_mandate",
      "constitution_schemas",
      "validate_capsule",
      "seal_bond",
      "validate_bond",
    ]);
  });

  it("handles initialize and tools/list", () => {
    const init = handleMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(init?.result).toMatchObject({
      serverInfo: { name: "vibe-release-gates" },
    });

    const tools = handleMcpRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    expect(tools?.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "resolve_gate" }),
      ]),
    });
  });

  it("resolves gates through tools/call", () => {
    const response = handleMcpRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "resolve_gate",
        arguments: {
          title: "Release gate: PR review workflow smoke trigger (PR Feedback)",
          body: "",
        },
      },
    });

    const text = (response?.result as { content: { text: string }[] }).content[0]
      .text;
    expect(JSON.parse(text).id).toBe("pr-review-smoke");
  });

  it("previews a gate by id", () => {
    const text = callReleaseGateTool("preview_gate", { id: "cloud-loop-smoke" });
    expect(JSON.parse(text).files).toHaveLength(2);
  });

  it("evaluates mandates for proposed files", () => {
    const text = callReleaseGateTool("evaluate_mandate", {
      proposed_files: ["src/auth/session.ts"],
    });
    const parsed = JSON.parse(text);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("forbidden_prefix");
    expect(parsed.evaluation.passed).toBe(false);
    expect(parsed.evaluation.violations[0].rule).toBe("forbidden");
  });

  it("exports constitution schemas", () => {
    const text = callReleaseGateTool("constitution_schemas");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.ExecutionDag).toMatchObject({ type: "object" });
  });

  it("validates a run capsule manifest", () => {
    const text = callReleaseGateTool("validate_capsule", {
      manifest: {
        runId: "run-test",
        issueNumber: "1",
        issueTitle: "Test",
        branchName: "main",
        baseSha: "abc",
        generatedFiles: [],
        createdAt: "2026-07-04T00:00:00.000Z",
        vowsHash: computeVowsHash("."),
        metrics: {
          attempts: 1,
          firstPassGreen: true,
          gateIdsFailed: [],
          durationMs: 1,
        },
      },
    });
    const parsed = JSON.parse(text);
    expect(parsed.valid).toBe(true);
    expect(parsed.capsuleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.vowsHash).toBeTruthy();
  });

  it("validates bond from issue body", () => {
    const text = callReleaseGateTool("validate_bond", {
      issue_body: `### Intent (one sentence)
Add endpoint

### Files to touch (exact paths)
src/x.ts
`,
      depth: 3,
    });
    const parsed = JSON.parse(text);
    expect(parsed.valid).toBe(true);
    expect(parsed.ok).toBe(true);
    expect(parsed.bond.boundFiles).toContain("src/x.ts");
  });
});
