import { assign, setup } from "xstate";
import { collectPlannedFiles } from "../planning/dag.js";
import { evaluateMandates } from "../policy/evaluate.js";
import { depthCapabilities, type VibeDepth } from "./depth.js";
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

function resolveDepth(depth?: number): VibeDepth {
  if (depth === undefined) return 3;
  if (Number.isInteger(depth) && depth >= 0 && depth <= 5) {
    return depth as VibeDepth;
  }
  return 3;
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
      depthAllowsCodegen: ({ context }) =>
        depthCapabilities(resolveDepth(context.vibeDepth)).allowsCodegen,
      depthAllowsDeploy: ({ context, event }) => {
        if (event.type !== "publish.completed") return true;
        if (!event.previewUrl) return true;
        return depthCapabilities(resolveDepth(context.vibeDepth)).allowsDeploy;
      },
      mandatesAllowPaths: ({ context }) => {
        if (!context.dag) return true;
        const files = collectPlannedFiles(context.dag);
        if (files.length === 0) return true;
        return evaluateMandates(files).passed;
      },
      attemptsRemaining: ({ context }) => context.attempts < context.maxAttempts,
    },
  }).createMachine({
    id: "vibe-engine-os",
    initial: "received",
    context,
    states: {
      received: {
        meta: {
          phase: "received",
          route: "/phase/received",
          view: {
            component: "ReceivedPhase",
            props: ({ context }: { context: OSContext }) => ({
              issueNumber: context.issueNumber,
              issueTitle: context.issueTitle,
            }),
          },
        },
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
        meta: {
          phase: "preflight",
          route: "/phase/preflight",
          view: {
            component: "PreflightPhase",
            props: ({ context }: { context: OSContext }) => ({
              findingsCount: context.findings.length,
            }),
          },
        },
        on: {
          "plan.created": {
            target: "planning",
            guard: "mandatesAllowPaths",
            actions: assign({
              dag: ({ event }) => event.dag,
            }),
          },
        },
      },
      planning: {
        meta: {
          phase: "planning",
          route: "/phase/planning",
          view: {
            component: "PlanningPhase",
            props: ({ context }: { context: OSContext }) => ({
              nodeCount: context.dag?.nodes.length ?? 0,
              issueNumber: context.issueNumber,
            }),
          },
        },
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
        meta: {
          phase: "risk_review",
          route: "/phase/risk-review",
          view: {
            component: "RiskReviewPhase",
            props: ({ context }: { context: OSContext }) => ({
              risk: context.risk ?? "low",
              reason: context.riskReason ?? "unreviewed",
              approvalRequired: context.approvalRequired,
            }),
          },
        },
        always: [
          { target: "awaiting_approval", guard: "requiresApproval" },
          {
            target: "generating_patch",
            guard: "depthAllowsCodegen",
          },
          { target: "failed" },
        ],
      },
      awaiting_approval: {
        meta: {
          phase: "awaiting_approval",
          route: "/phase/awaiting-approval",
          view: {
            component: "AwaitingApprovalPhase",
            props: ({ context }: { context: OSContext }) => ({
              risk: context.risk,
              reason: context.riskReason,
            }),
          },
        },
        on: {
          "approval.granted": {
            target: "generating_patch",
            guard: "depthAllowsCodegen",
          },
        },
      },
      generating_patch: {
        meta: {
          phase: "generating_patch",
          route: "/phase/generating-patch",
          view: {
            component: "GeneratingPatchPhase",
            props: ({ context }: { context: OSContext }) => ({
              attempts: context.attempts,
              maxAttempts: context.maxAttempts,
            }),
          },
        },
        on: {
          "attempt.started": {
            actions: assign({
              attempts: ({ event }) => event.attempt,
            }),
          },
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
        meta: {
          phase: "verifying",
          route: "/phase/verifying",
          view: {
            component: "VerifyingPhase",
            props: ({ context }: { context: OSContext }) => ({
              fileCount: context.generatedFiles.length,
            }),
          },
        },
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
        meta: {
          phase: "learning",
          route: "/phase/learning",
          view: {
            component: "LearningPhase",
            props: ({ context }: { context: OSContext }) => ({
              failureCount: context.failures.length,
            }),
          },
        },
        on: {
          "learning.recorded": "preflight",
          "operator.retry_requested": "preflight",
          "codegen.retry": {
            target: "generating_patch",
            guard: "attemptsRemaining",
          },
          "operator.rollback_requested": {
            actions: () => undefined,
          },
          "operator.status_requested": {
            actions: () => undefined,
          },
        },
      },
      publishing: {
        meta: {
          phase: "publishing",
          route: "/phase/publishing",
          view: { component: "PublishingPhase", props: () => ({}) },
        },
        on: {
          "publish.completed": {
            target: "completed",
            guard: "depthAllowsDeploy",
          },
        },
      },
      completed: {
        type: "final",
        meta: {
          phase: "completed",
          route: "/phase/completed",
          view: { component: "CompletedPhase", props: () => ({}) },
        },
      },
      failed: {
        type: "final",
        meta: {
          phase: "failed",
          route: "/phase/failed",
          view: { component: "FailedPhase", props: () => ({}) },
        },
      },
    },
  });
}
