export type OperatorCommand =
  | { type: "plan" }
  | { type: "approve" }
  | { type: "continue" }
  | { type: "retry" }
  | { type: "rollback" }
  | { type: "status" }
  | { type: "deploy" }
  | { type: "details" }
  | { type: "unknown"; raw: string };

export function parseOperatorCommand(input: string): OperatorCommand {
  const command = input.trim().split(/\s+/)[0]?.toLowerCase();

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
    default:
      return { type: "unknown", raw: input };
  }
}

export function chainsIntoResume(command: OperatorCommand): boolean {
  return command.type === "approve" || command.type === "continue";
}
