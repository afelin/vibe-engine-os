import type { z } from "zod";
import type { orchestratorDomainSchema } from "../constitution/catalog.js";

export type OrchestratorDomain = z.infer<typeof orchestratorDomainSchema>;

const M365_KEYWORDS =
  /\b(m365|microsoft|teams|sharepoint|entra|azure ad|bizchat|outlook|onedrive|copilot)\b/i;
const RESEARCH_KEYWORDS =
  /\b(research|scrape|web crawl|long.?running|hermes|notebook)\b/i;
const CODE_KEYWORDS =
  /\b(build|test|tsc|vitest|gate|bond|replay|capsule|typescript|compile|promotion)\b/i;

export function classifyProblem(
  symptom: string,
  body = "",
): OrchestratorDomain {
  const text = `${symptom}\n${body}`.toLowerCase();

  if (M365_KEYWORDS.test(text)) return "m365";
  if (RESEARCH_KEYWORDS.test(text)) return "research";
  if (CODE_KEYWORDS.test(text)) return "code";

  return "experiment";
}

export function domainToAgentSlot(
  domain: OrchestratorDomain,
  trustTier: "corporate" | "experiment" | "human-in-loop",
): string {
  if (domain === "m365") return "m365-guide";
  if (domain === "research") return "hermes";
  if (trustTier === "corporate") return "corp-claude";
  if (domain === "code") return "groq-experiment";
  return "groq-experiment";
}
