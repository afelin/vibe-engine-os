import type { OSEvent } from "../os/events.js";
import type { OperatorCommand } from "./commands.js";

type OperatorEventBase = {
  protocolVersion: "os.operator.v1";
  actor: string;
  commentId: string;
};

export type OperatorRequestedEvent =
  | ({ type: "operator.plan_requested" } & OperatorEventBase)
  | ({ type: "operator.retry_requested" } & OperatorEventBase)
  | ({ type: "operator.rollback_requested" } & OperatorEventBase)
  | ({ type: "operator.status_requested" } & OperatorEventBase)
  | ({ type: "operator.deploy_requested" } & OperatorEventBase)
  | ({ type: "operator.continue_requested" } & OperatorEventBase)
  | ({ type: "operator.details_requested" } & OperatorEventBase)
  | ({ type: "operator.troubleshoot_requested"; symptom: string } & OperatorEventBase);

export type OperatorEventMetadata = {
  actor: string;
  commentId: string;
};

export function mapCommandToEvent(
  command: OperatorCommand,
  metadata: OperatorEventMetadata,
): OSEvent | null {
  const base = {
    protocolVersion: "os.operator.v1" as const,
    actor: metadata.actor,
    commentId: metadata.commentId,
  };

  switch (command.type) {
    case "go":
      // Read-only guide — reuse status event so the machine stays idle.
      return { type: "operator.status_requested", ...base };
    case "plan":
      return { type: "operator.plan_requested", ...base };
    case "approve":
      return {
        type: "approval.granted",
        actor: metadata.actor,
        commentId: metadata.commentId,
      };
    case "retry":
      return { type: "operator.retry_requested", ...base };
    case "rollback":
      return { type: "operator.rollback_requested", ...base };
    case "status":
      return { type: "operator.status_requested", ...base };
    case "deploy":
      return { type: "operator.deploy_requested", ...base };
    case "continue":
      return { type: "operator.continue_requested", ...base };
    case "details":
      return { type: "operator.details_requested", ...base };
    case "troubleshoot":
      return {
        type: "operator.troubleshoot_requested",
        ...base,
        symptom: command.symptom,
      };
    case "unknown":
      return null;
  }
}
