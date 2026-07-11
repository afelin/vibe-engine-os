import { assign, setup } from "xstate";
import type { OSContext, OSEvent } from "./events.js";

export function createInitialOSContext(): OSContext {
  return {
    issueNumber: process.env.ISSUE_NUMBER || "000",
    issueTitle: process.env.ISSUE_TITLE || "Vibe Request",
    issueBody: process.env.ISSUE_BODY || "No details provided.",
    attempts: 0,
    maxAttempts: 3,
    findings: [],
    generatedFiles: [],
    verificationResults: [],
    failures: [],
  };
}

export function createOSMachine(context: OSContext = createInitialOSContext()) {
  return setup({
    types: {
      context: {} as OSContext,
      events: {} as OSEvent,
    },
    guards: {
      requiresApproval: ({ context }) =>
        context.approvalRequired === true || context.risk === "high",
    },
  }).createMachine({
    id: "vibe-engine-os",
    initial: "received",
    context,
    states: {
      received: {
        on: {
          "preflight.completed": {
            target: "preflight",
            actions: assign({
              findings: ({ event }) => event.findings,
            }),
          },
        },
      },
      preflight: {
        on: {
          "plan.created": {
            target: "planning",
            actions: assign({
              dag: ({ event }) => event.dag,
            }),
          },
        },
      },
      planning: {
        on: {
          "risk.reviewed": {
            target: "risk_review",
            actions: assign({
              risk: ({ event }) => event.risk,
              riskReason: ({ event }) => event.reason,
              approvalRequired: ({ event }) => event.approvalRequired,
            }),
          },
        },
      },
      risk_review: {
        always: [
          { target: "awaiting_approval", guard: "requiresApproval" },
          { target: "generating_patch" },
        ],
      },
      awaiting_approval: {
        on: {
          "approval.granted": "generating_patch",
        },
      },
      generating_patch: {
        on: {
          "patch.generated": {
            target: "verifying",
            actions: assign({
              generatedFiles: ({ event }) => event.files,
            }),
          },
          "verification.failed": {
            target: "learning",
            actions: assign({
              failures: ({ context, event }) => [
                ...context.failures,
                event.failure,
              ],
            }),
          },
        },
      },
      verifying: {
        on: {
          "verification.passed": {
            target: "publishing",
            actions: assign({
              verificationResults: ({ event }) => event.results,
            }),
          },
          "verification.failed": {
            target: "learning",
            actions: assign({
              failures: ({ context, event }) => [
                ...context.failures,
                event.failure,
              ],
            }),
          },
        },
      },
      learning: {
        on: {
          "learning.recorded": "preflight",
          "operator.retry_requested": "preflight",
          "operator.rollback_requested": {
            actions: () => undefined,
          },
          "operator.status_requested": {
            actions: () => undefined,
          },
        },
      },
      publishing: {
        on: {
          "publish.completed": "completed",
        },
      },
      completed: {
        type: "final",
      },
      failed: {
        type: "final",
      },
    },
  });
}
