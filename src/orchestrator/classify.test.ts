import { describe, expect, it } from "vitest";
import { classifyProblem, domainToAgentSlot } from "./classify.js";

describe("orchestrator classify", () => {
  it("routes M365 symptoms to m365 domain", () => {
    expect(classifyProblem("Teams webhook failing")).toBe("m365");
    expect(domainToAgentSlot("m365", "corporate")).toBe("m365-guide");
  });

  it("routes build/test symptoms to code domain", () => {
    expect(classifyProblem("vitest failing on replay gate")).toBe("code");
    expect(domainToAgentSlot("code", "corporate")).toBe("corp-claude");
  });

  it("routes research symptoms to research domain", () => {
    expect(classifyProblem("long research scrape job")).toBe("research");
    expect(domainToAgentSlot("research", "experiment")).toBe("hermes");
  });

  it("defaults experiment trust to groq-experiment", () => {
    expect(domainToAgentSlot("experiment", "experiment")).toBe("groq-experiment");
  });
});
