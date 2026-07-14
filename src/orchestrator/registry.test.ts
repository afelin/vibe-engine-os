import { describe, expect, it } from "vitest";
import { invokeM365Guide, buildM365Prompt } from "./primitives/invokeM365Guide.js";
import { resolveCorpClaudeConfigDir } from "./primitives/invokeCorpClaude.js";
import { listDetectedAgents, loadAgentsRegistry } from "./registry.js";

describe("orchestrator primitives", () => {
  it("m365 guide returns BizChat link and human step", async () => {
    const result = await invokeM365Guide({
      symptom: "SharePoint list sync broken",
      context: "Site collection ABC",
    });
    expect(result.humanStep).toBe(true);
    expect(result.bizChatUrl).toContain("m365.cloud.microsoft/chat");
    expect(result.promptBlock).toContain("SharePoint");
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
