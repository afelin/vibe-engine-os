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
  it("advertises nineteen tools with preflight first", () => {
    expect(RELEASE_GATE_TOOLS.map((tool) => tool.name)).toEqual([
      "preflight",
      "authorize_write",
      "list_gates",
      "resolve_gate",
      "preview_gate",
      "evaluate_mandate",
      "evaluate_house_rules",
      "constitution_schemas",
      "validate_capsule",
      "seal_bond",
      "validate_bond",
      "build_scoped_context",
      "recall_lessons",
      "list_stackables",
      "set_legal_space",
      "get_active_stack",
      "cyberready_validate_delta",
      "resolve_agent_profile",
      "coreward_mode_status",
    ]);
    expect(RELEASE_GATE_TOOLS[0]?.description).toMatch(/REQUIRED default/i);
    expect(
      RELEASE_GATE_TOOLS.filter((t) => t.name !== "preflight").every((t) =>
        t.description.startsWith("[advanced]"),
      ),
    ).toBe(true);
  });

  it("handles initialize and tools/list", () => {
    const init = handleMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(init?.result).toMatchObject({
      serverInfo: { name: "coreward-release-gates" },
    });

    const tools = handleMcpRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    expect(tools?.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "preflight" }),
        expect.objectContaining({ name: "resolve_gate" }),
        expect.objectContaining({ name: "authorize_write" }),
        expect.objectContaining({ name: "list_stackables" }),
        expect.objectContaining({ name: "set_legal_space" }),
        expect.objectContaining({ name: "get_active_stack" }),
        expect.objectContaining({ name: "cyberready_validate_delta" }),
      ]),
    });
  });

  it("cyberready_validate_delta returns not_installed without CYBERREADY_SOCK and does not throw", () => {
    const prev = process.env.CYBERREADY_SOCK;
    delete process.env.CYBERREADY_SOCK;
    try {
      expect(() =>
        callReleaseGateTool("cyberready_validate_delta", {}),
      ).not.toThrow();
      const text = callReleaseGateTool("cyberready_validate_delta", {});
      const parsed = JSON.parse(text) as { ok: boolean; reason?: string };
      expect(parsed.ok).toBe(false);
      expect(parsed.reason).toBe("not_installed");

      const response = handleMcpRequest({
        jsonrpc: "2.0",
        id: 40,
        method: "tools/call",
        params: { name: "cyberready_validate_delta", arguments: {} },
      });
      expect(response?.result).toMatchObject({ isError: false });
      const body = (response?.result as { content: { text: string }[] }).content[0]
        .text;
      expect(JSON.parse(body).reason).toBe("not_installed");
    } finally {
      if (prev === undefined) {
        delete process.env.CYBERREADY_SOCK;
      } else {
        process.env.CYBERREADY_SOCK = prev;
      }
    }
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
    expect(parsed.ContextPack).toMatchObject({ type: "object" });
    expect(parsed.EvoLesson).toMatchObject({ type: "object" });
  });

  it("builds scoped context bundle via MCP", () => {
    const text = callReleaseGateTool("build_scoped_context", {
      root_dir: ".",
      bond_files: ["src/os/run.ts"],
      max_total_chars: 5000,
      ticket_id: "aw_test_pack",
    });
    const parsed = JSON.parse(text) as {
      files: unknown[];
      totalChars: number;
      pack: { version: string; ticket_id?: string; hops: number };
      hops: number;
    };
    expect(parsed.files.length).toBeGreaterThan(0);
    expect(parsed.totalChars).toBeGreaterThan(0);
    expect(parsed.pack.version).toBe("context_pack.v1");
    expect(parsed.pack.ticket_id).toBe("aw_test_pack");
    expect(typeof parsed.hops).toBe("number");
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

  it("lists stackables including none, eu-nis2-cra, us-baseline, and tabdab", () => {
    const text = callReleaseGateTool("list_stackables", { root_dir: "." });
    const parsed = JSON.parse(text) as {
      legal_spaces: string[];
      project_profiles: string[];
    };
    expect(parsed.legal_spaces).toEqual(["eu-nis2-cra", "none", "us-baseline"]);
    expect(parsed.project_profiles).toContain("tabdab");
  });

  it("evaluate_mandate reflects eu-nis2-cra pack deltas", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-mcp-eval-"));
    try {
      fs.mkdirSync(path.join(root, "src/policy"), { recursive: true });
      fs.copyFileSync(
        path.join(process.cwd(), "src/policy/mandates.json"),
        path.join(root, "src/policy/mandates.json"),
      );
      callReleaseGateTool("set_legal_space", {
        root_dir: root,
        legal_space: "eu-nis2-cra",
      });
      const text = callReleaseGateTool("evaluate_mandate", {
        root_dir: root,
        proposed_files: ["src/crypto/keys.ts"],
      });
      const parsed = JSON.parse(text) as {
        evaluation: { passed: boolean };
        legalSpace: string;
      };
      expect(parsed.legalSpace).toBe("eu-nis2-cra");
      expect(parsed.evaluation.passed).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

  it("resolve_agent_profile returns null without profile fields and resolves default", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-mcp-aid-"));
    try {
      fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".vibe", "principals.json"),
        JSON.stringify({
          principals: [
            {
              id: "cursor-bot",
              public_key: "pk",
              default: true,
              default_path_constraints: ["src/"],
            },
          ],
        }),
        "utf8",
      );
      const missing = JSON.parse(
        callReleaseGateTool("resolve_agent_profile", {
          root_dir: root,
          actor: "nobody",
        }),
      ) as { profile: unknown };
      expect(missing.profile).toBeNull();

      const def = JSON.parse(
        callReleaseGateTool("resolve_agent_profile", {
          root_dir: root,
          default: true,
        }),
      ) as { profile: { agent_id: string }; profile_hash: string };
      expect(def.profile.agent_id).toBe("cursor-bot");
      expect(def.profile_hash).toMatch(/^[a-f0-9]{64}$/);

      const ci = JSON.parse(
        callReleaseGateTool("resolve_agent_profile", {
          root_dir: root,
          actor: "github-ci-bot-override",
        }),
      ) as { profile: { agent_id: string } };
      expect(ci.profile.agent_id).toBe("github-ci-bot-override");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("preflight returns ok, ticket_id, stack, and prefer_gate shape", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-mcp-pf-"));
    try {
      const text = callReleaseGateTool("preflight", {
        root_dir: root,
        proposed_files: ["src/ok.ts"],
        title: "chore",
      });
      const parsed = JSON.parse(text) as {
        ok: boolean;
        ticket_id?: string;
        stack?: { legalSpace?: string };
        reason: string;
        prefer_gate?: string | null;
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.ticket_id).toMatch(/^aw_/);
      expect(parsed.stack).toBeDefined();
      expect(parsed.reason).toMatch(/authorized/);
      expect(parsed).toHaveProperty("prefer_gate");
    } finally {
      delete process.env.COREWARD_AUTHORIZE_TICKET;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("evaluate_house_rules aliases evaluate_mandate", () => {
    const a = JSON.parse(
      callReleaseGateTool("evaluate_mandate", {
        proposed_files: ["src/auth/session.ts"],
      }),
    );
    const b = JSON.parse(
      callReleaseGateTool("evaluate_house_rules", {
        proposed_files: ["src/auth/session.ts"],
      }),
    );
    expect(b.ok).toBe(a.ok);
    expect(b.reason).toBe(a.reason);
  });
});
