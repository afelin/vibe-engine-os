import { describe, expect, it } from "vitest";
import { invokeM365Guide, buildM365Prompt } from "./primitives/invokeM365Guide.js";
import { resolveCorpClaudeConfigDir } from "./primitives/invokeCorpClaude.js";
import { detectHermes, invokeHermes } from "./primitives/invokeHermes.js";
import { listDetectedAgents, loadAgentsRegistry } from "./registry.js";

describe("orchestrator primitives", () => {
  it("m365 guide returns BizChat link and human step (no API proxy)", async () => {
    const result = await invokeM365Guide({
      symptom: "SharePoint list sync broken",
      context: "Site collection ABC",
    });
    expect(result.humanStep).toBe(true);
    expect(result.agentSlot).toBe("m365-guide");
    expect(result.bizChatUrl).toBe("https://m365.cloud.microsoft/chat");
    expect(result.promptBlock).toContain("SharePoint");
    expect(result.promptBlock).toMatch(/no third-party proxies/i);
  });

  it("buildM365Prompt includes category", () => {
    const prompt = buildM365Prompt({
      symptom: "Teams channel",
      context: "webhook",
      category: "teams",
    });
    expect(prompt).toContain("teams");
  });

  it("resolveCorpClaudeConfigDir respects CLAUDE_CONFIG_DIR", () => {
    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = "/tmp/corp-claude";
    expect(resolveCorpClaudeConfigDir()).toBe("/tmp/corp-claude");
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  });

  it("invokeHermes degrades when CLI missing", async () => {
    expect(detectHermes("hermes-binary-that-does-not-exist-xyz")).toBe(false);
    const result = await invokeHermes(
      {
        symptom: "research topic",
        title: "research",
        trustTier: "experiment",
        domain: "research",
      },
      "hermes-binary-that-does-not-exist-xyz",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("hermes_not_installed");
  });
});

describe("orchestrator registry", () => {
  it("loads default agents when config missing", () => {
    const agents = loadAgentsRegistry("/nonexistent-path-for-test");
    expect(agents.map((a) => a.id)).toContain("corp-claude");
    expect(agents.map((a) => a.id)).toContain("groq-experiment");
  });

  it("lists detected agents with availability flags", () => {
    const list = listDetectedAgents(".");
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.find((a) => a.id === "m365-guide")?.available).toBe(true);
  });
});
