export type M365Category = "teams" | "sharepoint" | "entra" | "general";

export type M365GuideInput = {
  symptom: string;
  context: string;
  category: M365Category;
};

export type M365GuideOutput = {
  bizChatUrl: string;
  promptBlock: string;
  humanStep: true;
  agentSlot: "m365-guide";
};

const BIZCHAT_BASE = "https://m365.cloud.microsoft/chat";

function inferCategory(symptom: string): M365Category {
  const text = symptom.toLowerCase();
  if (/teams|webhook|channel/.test(text)) return "teams";
  if (/sharepoint|list|site/.test(text)) return "sharepoint";
  if (/entra|azure ad|sso|identity/.test(text)) return "entra";
  return "general";
}

export function buildM365Prompt(input: M365GuideInput): string {
  return [
    "I need help troubleshooting a Microsoft 365 issue in my organization.",
    "",
    `Category: ${input.category}`,
    `Symptom: ${input.symptom}`,
    "",
    "Context:",
    input.context,
    "",
    "Please suggest official Microsoft steps — no third-party proxies or token extraction.",
  ].join("\n");
}

export async function invokeM365Guide(
  input: Partial<M365GuideInput> & { symptom: string; context?: string },
): Promise<M365GuideOutput> {
  const category = input.category ?? inferCategory(input.symptom);
  const context = input.context ?? "";
  const promptBlock = buildM365Prompt({
    symptom: input.symptom,
    context,
    category,
  });

  return {
    bizChatUrl: BIZCHAT_BASE,
    promptBlock,
    humanStep: true,
    agentSlot: "m365-guide",
  };
}
