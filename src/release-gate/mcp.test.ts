import { describe, expect, it } from "vitest";
import {
  callReleaseGateTool,
  handleMcpRequest,
  RELEASE_GATE_TOOLS,
} from "./mcp-handlers.js";

describe("release gate MCP handlers", () => {
  it("advertises three deterministic tools", () => {
    expect(RELEASE_GATE_TOOLS.map((tool) => tool.name)).toEqual([
      "list_gates",
      "resolve_gate",
      "preview_gate",
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
});
