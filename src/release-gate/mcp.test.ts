import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  callReleaseGateTool,
  handleMcpRequest,
  RELEASE_GATE_TOOLS,
} from "./mcp-handlers.js";
import { computeVowsHash } from "../constitution/vows.js";

describe("release gate MCP handlers", () => {
  it("advertises thirteen deterministic tools", () => {
    expect(RELEASE_GATE_TOOLS.map((tool) => tool.name)).toEqual([
      "list_gates",
      "resolve_gate",
      "preview_gate",
      "evaluate_mandate",
      "constitution_schemas",
      "validate_capsule",
      "seal_bond",
      "validate_bond",
      "build_scoped_context",
      "recall_lessons",
      "list_stackables",
      "set_legal_space",
      "get_active_stack",
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
        expect.objectContaining({ name: "list_stackables" }),
        expect.objectContaining({ name: "set_legal_space" }),
        expect.objectContaining({ name: "get_active_stack" }),
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

  it("returns ok:true with requiresApproval for protected paths", () => {
    const text = callReleaseGateTool("evaluate_mandate", {
      proposed_files: ["package.json"],
    });
    const parsed = JSON.parse(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.requiresApproval).toBe(true);
    expect(parsed.approvalPaths).toContain("package.json");
    expect(parsed.evaluation.passed).toBe(true);
  });

  it("exports constitution schemas", () => {
    const text = callReleaseGateTool("constitution_schemas");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.ExecutionDag).toMatchObject({ type: "object" });
    expect(parsed.ScopedContextBundle).toMatchObject({ type: "object" });
    expect(parsed.EvoLesson).toMatchObject({ type: "object" });
  });

  it("builds scoped context bundle via MCP", () => {
    const text = callReleaseGateTool("build_scoped_context", {
      root_dir: ".",
      bond_files: ["src/os/run.ts"],
      max_total_chars: 5000,
    });
    const parsed = JSON.parse(text) as { files: unknown[]; totalChars: number };
    expect(parsed.files.length).toBeGreaterThan(0);
    expect(parsed.totalChars).toBeGreaterThan(0);
  });

  it("recalls lessons via MCP", () => {
    const text = callReleaseGateTool("recall_lessons", {
      root_dir: ".",
      path_prefixes: ["src/"],
      limit: 3,
    });
    const parsed = JSON.parse(text) as { lessons: unknown[]; markdown: string };
    expect(Array.isArray(parsed.lessons)).toBe(true);
    expect(typeof parsed.markdown).toBe("string");
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

  it("lists stackables including none and tabdab", () => {
    const text = callReleaseGateTool("list_stackables", { root_dir: "." });
    const parsed = JSON.parse(text) as {
      legal_spaces: string[];
      project_profiles: string[];
    };
    expect(parsed.legal_spaces).toContain("none");
    expect(parsed.project_profiles).toContain("tabdab");
  });

  it("set_legal_space rejects unknown ids", () => {
    const response = handleMcpRequest({
      jsonrpc: "2.0",
      id: 99,
      method: "tools/call",
      params: {
        name: "set_legal_space",
        arguments: { legal_space: "not-a-real-space", root_dir: "." },
      },
    });
    expect(response?.result).toMatchObject({ isError: true });
    const text = (response?.result as { content: { text: string }[] }).content[0]
      .text;
    expect(text).toMatch(/Unknown legal space/);
  });

  it("set_legal_space and get_active_stack round-trip none", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-mcp-stack-"));
    try {
      const setText = callReleaseGateTool("set_legal_space", {
        root_dir: root,
        legal_space: "none",
      });
      const setParsed = JSON.parse(setText) as {
        ok: boolean;
        stack: { legalSpace: string };
      };
      expect(setParsed.ok).toBe(true);
      expect(setParsed.stack.legalSpace).toBe("none");

      const getText = callReleaseGateTool("get_active_stack", { root_dir: root });
      const getParsed = JSON.parse(getText) as {
        ok: boolean;
        stack: { legalSpace: string } | null;
      };
      expect(getParsed.ok).toBe(true);
      expect(getParsed.stack?.legalSpace).toBe("none");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
