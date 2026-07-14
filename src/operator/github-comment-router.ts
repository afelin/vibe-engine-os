import type { OSContext, OSEvent } from "../os/events.js";
import type { RollbackInstructions } from "../run/rollback.js";
import { isApproverAllowed } from "../policy/approvers.js";
import { parseOperatorCommand } from "./commands.js";
import { mapCommandToEvent } from "./events.js";
import { renderCockpitComment } from "./cockpit.js";
import { detectShipWork } from "./ship-heuristic.js";

export type GitHubCommentRouteInput = {
  body: string;
  actor: string;
  commentId: string;
  state: string;
  rootDir?: string;
  context: OSContext;
  labels?: string;
  repository?: string;
  hasBond?: boolean;
  readRollback: () => RollbackInstructions;
};

export type GitHubCommentRouteResult =
  | {
      handled: true;
      event: OSEvent;
      responseBody: string;
    }
  | {
      handled: true;
      event: null;
      responseBody: string;
    }
  | {
      handled: false;
      event: null;
      responseBody: null;
    };

export function routeGitHubComment(
  input: GitHubCommentRouteInput,
): GitHubCommentRouteResult {
  const command = parseOperatorCommand(input.body);
  if (command.type === "unknown") {
    const ship = detectShipWork({
      body: input.body,
      labels: input.labels,
      hasBond: input.hasBond,
      repository: input.repository,
    });
    if (ship.looksLikeShipWork && ship.nudge) {
      return {
        handled: true,
        event: null,
        responseBody: ship.nudge,
      };
    }
    return { handled: false, event: null, responseBody: null };
  }

  if (command.type === "approve") {
    const rootDir = input.rootDir ?? ".";
    if (!isApproverAllowed(input.actor, rootDir)) {
      return {
        handled: true,
        event: null,
        responseBody: [
          "## Approval denied",
          "",
          `\`${input.actor}\` is not on the approver allowlist.`,
          "Configure `approved_operators` in `src/policy/mandates.json` or set `VIBE_APPROVERS`.",
        ].join("\n"),
      };
    }
  }

  const event = mapCommandToEvent(command, {
    actor: input.actor,
    commentId: input.commentId,
  });

  if (!event) {
    return { handled: false, event: null, responseBody: null };
  }

  return {
    handled: true,
    event,
    responseBody: responseBodyForCommand(command.type, input),
  };
}

function responseBodyForCommand(
  commandType: Exclude<ReturnType<typeof parseOperatorCommand>["type"], "unknown">,
  input: GitHubCommentRouteInput,
): string {
  const cockpitOptions = {
    labels: input.labels,
    commandBody: input.body,
    expandTechnical: commandType === "details",
  };

  switch (commandType) {
    case "approve":
      return [
        "## Approval received",
        "",
        "Resuming the paused run to finish codegen and promotion.",
        "",
        renderCockpitComment(input.state, input.context, input.rootDir, undefined, cockpitOptions),
      ].join("\n");
    case "continue":
      return [
        "## Continue requested",
        "",
        "Resuming the active run from the saved checkpoint.",
        "",
        renderCockpitComment(input.state, input.context, input.rootDir, undefined, cockpitOptions),
      ].join("\n");
    case "details":
      return renderCockpitComment(
        input.state,
        input.context,
        input.rootDir,
        undefined,
        { ...cockpitOptions, expandTechnical: true },
      );
    case "rollback":
      return input.readRollback().body;
    case "status":
      return renderCockpitComment(
        input.state,
        input.context,
        input.rootDir,
        undefined,
        cockpitOptions,
      );
    case "plan":
      return [
        "## Plan requested",
        "",
        "The plan request was recorded as a typed OS event.",
        "",
        renderCockpitComment(input.state, input.context, input.rootDir, undefined, cockpitOptions),
      ].join("\n");
    case "retry":
      return [
        "## Retry requested",
        "",
        "The retry request was recorded as a typed OS event. The actor decides whether retry is valid from the current state.",
        "",
        renderCockpitComment(input.state, input.context, input.rootDir, undefined, cockpitOptions),
      ].join("\n");
    case "deploy":
      return [
        "## Deploy requested",
        "",
        "The deploy request was recorded as a typed OS event. Deployment remains gated until the actor reaches a deployable state.",
        "",
        renderCockpitComment(input.state, input.context, input.rootDir, undefined, cockpitOptions),
      ].join("\n");
    case "troubleshoot":
      return [
        "## Troubleshoot requested",
        "",
        "Routing through the orchestrator DAG (resolve_gate → diagnostics → heal ladder).",
        "",
        renderCockpitComment(input.state, input.context, input.rootDir, undefined, cockpitOptions),
      ].join("\n");
  }
}
