import { describe, expect, it } from "vitest";
import { mapCommandToEvent } from "./events.js";

describe("operator event mapping", () => {
  it("maps slash commands into typed OS events", () => {
    const base = { actor: "alice", commentId: "comment-1" };

    expect(mapCommandToEvent({ type: "plan" }, base)).toEqual({
      type: "operator.plan_requested",
      protocolVersion: "os.operator.v1",
      actor: "alice",
      commentId: "comment-1",
    });
    expect(mapCommandToEvent({ type: "approve" }, base)).toEqual({
      type: "approval.granted",
      actor: "alice",
      commentId: "comment-1",
    });
    expect(mapCommandToEvent({ type: "retry" }, base)).toMatchObject({
      type: "operator.retry_requested",
      actor: "alice",
    });
    expect(mapCommandToEvent({ type: "rollback" }, base)).toMatchObject({
      type: "operator.rollback_requested",
      actor: "alice",
    });
    expect(mapCommandToEvent({ type: "status" }, base)).toMatchObject({
      type: "operator.status_requested",
      actor: "alice",
    });
    expect(mapCommandToEvent({ type: "deploy" }, base)).toMatchObject({
      type: "operator.deploy_requested",
      actor: "alice",
    });
    expect(
      mapCommandToEvent({ type: "troubleshoot", symptom: "gate fail" }, base),
    ).toMatchObject({
      type: "operator.troubleshoot_requested",
      symptom: "gate fail",
    });
  });

  it("does not create OS events for unknown commands", () => {
    expect(
      mapCommandToEvent(
        { type: "unknown", raw: "/shipit" },
        { actor: "alice", commentId: "comment-1" },
      ),
    ).toBeNull();
  });
});
