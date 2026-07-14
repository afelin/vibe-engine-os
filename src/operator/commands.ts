export type OperatorCommand =
  | { type: "plan" }
  | { type: "approve" }
  | { type: "continue" }
  | { type: "retry" }
  | { type: "rollback" }
  | { type: "status" }
  | { type: "deploy" }
  | { type: "details" }
  | { type: "troubleshoot"; symptom: string }
  | { type: "unknown"; raw: string };

export function parseOperatorCommand(input: string): OperatorCommand {
  const trimmed = input.trim();
  const command = trimmed.split(/\s+/)[0]?.toLowerCase();

  switch (command) {
    case "/plan":
      return { type: "plan" };
    case "/approve":
      return { type: "approve" };
    case "/continue":
      return { type: "continue" };
    case "/retry":
      return { type: "retry" };
    case "/rollback":
      return { type: "rollback" };
    case "/status":
      return { type: "status" };
    case "/deploy":
      return { type: "deploy" };
    case "/details":
      return { type: "details" };
    case "/troubleshoot": {
      const symptom = trimmed.slice("/troubleshoot".length).trim();
      return { type: "troubleshoot", symptom: symptom || "unspecified issue" };
    }
    default:
      return { type: "unknown", raw: input };
  }
}

export function chainsIntoResume(command: OperatorCommand): boolean {
  return command.type === "approve" || command.type === "continue";
}
