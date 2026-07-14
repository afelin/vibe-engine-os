export type AgentSlotId =
  | "corp-claude"
  | "m365-guide"
  | "hermes"
  | "groq-experiment"
  | "human";

export type AgentResult = {
  ok: boolean;
  agentSlot: AgentSlotId;
  recommendation?: string;
  reason?: string;
  stdout?: string;
  stderr?: string;
};
