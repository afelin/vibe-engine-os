export type OperatorCommand =
  | { type: "plan" }
  | { type: "approve" }
  | { type: "retry" }
  | { type: "rollback" }
  | { type: "status" }
  | { type: "deploy" }
  | { type: "unknown"; raw: string };

export function parseOperatorCommand(input: string): OperatorCommand {
  const command = input.trim().split(/\s+/)[0]?.toLowerCase();

  switch (command) {
    case "/plan":
      return { type: "plan" };
    case "/approve":
      return { type: "approve" };
    case "/retry":
      return { type: "retry" };
    case "/rollback":
      return { type: "rollback" };
    case "/status":
      return { type: "status" };
    case "/deploy":
      return { type: "deploy" };
    default:
      return { type: "unknown", raw: input };
  }
}
