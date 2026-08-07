import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import {
  collectPlannedFiles,
  parsePlannerDag,
  resolveRiskReview,
  riskForFiles,
  topologicalSort,
  validateAndParseDag,
  validateDag,
} from "../planning/dag.js";
import { evaluateMandates, loadMandates } from "../policy/evaluate.js";
import { resolveCodegenEndpoint, resolveCriticEndpoint, resolvePlannerEndpoint } from "../llm/router.js";
import { resolveReleaseGatePatch } from "../release-gate/resolve.js";
import {
  createGateFailure,
  formatGateFailuresMarkdown,
  type GateFailure,
} from "../verification/feedback.js";
import {
  prepareGeneratedPatch,
  runGeneratedPatchValidators,
} from "../verification/pipeline.js";
import { createInitialOSContext } from "./machine.js";
import {
  createOSPlayer,
  getPersistedSnapshot,
  isTerminalSnapshot,
  type OSPlayer,
  type OSPlayerSnapshot,
} from "./player.js";
import { depthCapabilities, getVibeDepth } from "./depth.js";
import {
  appendTraceSpan,
  formatFailureRecall,
  readRecentFailuresByPathPrefix,
} from "./trace.js";
import type {
  ClassifiedFailure,
  ExecutionDag,
  GeneratedFile,
  OSContext,
  OSEvent,
  VerificationResult,
} from "./events.js";
import { appendOsEvent, initializeEventLedger } from "./replay.js";
import {
  appendScoreboardEntry,
  readActorSnapshot,
  type RunManifest,
  type RunMetrics,
  writeActorSnapshot,
} from "../run/manifest.js";
import {
  buildContextBundle,
  formatContextBundleForPrompt,
  resolveContextFiles,
  type ScopedContextBundle,
} from "../context/bundle.js";
import { capContext } from "../context/cap.js";
import { recallLessons } from "../memory/recall.js";
import {
  seedGateFeedbackCache,
  writeGateFeedbackEntry,
} from "../memory/feedback-cache.js";
import { appendLesson, writeEvoMemExport } from "../memory/lesson.js";
import {
  buildVitestSubgraphCommand,
  mapChangedFilesToVitest,
} from "../verification/subgraph.js";
import { computeVowsHash } from "../constitution/vows.js";
import {
  computeCapsuleHash,
  readTraceTail,
  writeCapsuleHash,
} from "../constitution/capsule.js";
import { readPersistedApproval } from "./approval-store.js";
import { sanitizeRunId } from "../run/paths.js";
import { readIssueRunIndex, writeIssueRunIndex } from "../run/issue-index.js";
import { sha256Content } from "../run/promotion.js";
import { sealTaskBond, type TaskBond } from "../bond/seal.js";
import { readTaskBond, writeTaskBond } from "../bond/store.js";
import {
  assertWard,
  effectiveDepth,
  loadActiveMandate,
  persistRunMandate,
  resolveEffectiveBudgetStrict,
  resolveMandateProfile,
  verifyOnce,
  writeWardRunState,
  type VerifiedMandate,
} from "../ward/index.js";
import { assertCorewardMode } from "../coreward/mode.js";

export type RunInput = {
  issueNumber: string;
  issueTitle: string;
  issueBody: string;
  githubActor?: string;
  approvedBy?: string;
  rootDir?: string;
};

export type RunOutput = {
  success: boolean;
  state: string;
  context: OSContext;
  generatedFiles: GeneratedFile[];
  manifest?: RunManifest;
  feedbackMarkdown: string;
  gateFailures: GateFailure[];
  recordedErrors: string[];
};

type LlmCaller = (
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  jsonMode?: boolean,
) => Promise<string>;

type GeminiCaller = (apiKey: string, system: string, user: string) => Promise<string>;

export type RunDeps = {
  callOpenAI: LlmCaller;
  callGemini: GeminiCaller;
  getGitValue: (command: string, fallback: string) => string;
  readConstitution: () => string;
  readRepoContext: () => string;
  readEvoMem: () => string;
  writePlan: (issueNumber: string, plan: string) => void;
  writeFilesToDisk: (files: GeneratedFile[]) => Map<string, string | null>;
  restoreBackups: (backups: Map<string, string | null>) => void;
  runTsc: () => void;
  runVitest: () => void;
  runVitestSubgraph?: (changedPaths: string[]) => void;
  appendEvoMem: (content: string) => void;
  writeCriticFailed: (content: string) => void;
};

function defaultDeps(rootDir = "."): RunDeps {
  return {
    callOpenAI: callOpenAIFormat,
    callGemini: callGeminiFormat,
    getGitValue,
    readConstitution: () => {
      const agentsPath = path.join(rootDir, "AGENTS.md");
      const agentPath = path.join(rootDir, "agent.md");
      const constitutionPath = fs.existsSync(agentsPath)
        ? agentsPath
        : agentPath;
      return fs.readFileSync(constitutionPath, "utf8");
    },
    readRepoContext: () => {
      const repomixPath = path.join(rootDir, "repomix-output.txt");
      return fs.existsSync(repomixPath)
        ? fs.readFileSync(repomixPath, "utf8")
        : "Repository is currently empty.";
    },
    readEvoMem: () => {
      const evoPath = path.join(rootDir, "EVOMEM.md");
      return fs.existsSync(evoPath) ? fs.readFileSync(evoPath, "utf8") : "";
    },
    writePlan: (issueNumber, plan) => {
      const planDir = path.join(rootDir, ".planning/milestones");
      if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
      fs.writeFileSync(path.join(planDir, `ISSUE_${issueNumber}_PLAN.md`), plan);
    },
    writeFilesToDisk: (files) => writeFilesToDisk(files, rootDir),
    restoreBackups,
    runTsc: () => {
      const tsconfigPath = path.join(rootDir, "tsconfig.json");
      if (fs.existsSync(tsconfigPath)) {
        execSync("npx tsc --noEmit", { cwd: rootDir, stdio: "pipe" });
      }
    },
    runVitest: () => execSync("npx vitest run", { cwd: rootDir, stdio: "pipe" }),
    runVitestSubgraph: (changedPaths: string[]) => {
      const testFiles = mapChangedFilesToVitest(changedPaths, rootDir);
      const cmd = buildVitestSubgraphCommand(testFiles);
      execSync(cmd, { cwd: rootDir, stdio: "pipe" });
    },
    appendEvoMem: (content) => {
      fs.appendFileSync(path.join(rootDir, "EVOMEM.md"), content, "utf8");
    },
    writeCriticFailed: (content) => {
      fs.writeFileSync(path.join(rootDir, "CRITIC_FAILED.md"), content, "utf8");
    },
  };
}

export async function runOSActor(
  input: RunInput,
  depsInput?: RunDeps,
): Promise<RunOutput> {
  const rootDir = input.rootDir ?? ".";
  const deps = depsInput ?? defaultDeps(rootDir);
  const startedAt = Date.now();
  let depth = getVibeDepth();
  const mandates = loadMandates(rootDir);
  const runId = resolveRunId(input.issueNumber, rootDir);
  const persistedApproval = readPersistedApproval(rootDir, input.issueNumber);
  const approvedBy =
    input.approvedBy ?? persistedApproval?.approvedBy ?? undefined;
  const resumeSnapshot = loadResumeSnapshot(rootDir, runId, input.issueNumber);
  const pastPlanning = isPastPlanning(resumeSnapshot);

  // Opt-in Ward: absent Mandate file ⇒ legacy house rules only.
  let verifiedMandate: VerifiedMandate | null = null;
  let wardMaxContextChars: number | undefined;
  const activeMandate = loadActiveMandate(rootDir);
  if (activeMandate) {
    try {
      verifiedMandate = await verifyOnce(activeMandate, rootDir);
      depth = effectiveDepth(depth, verifiedMandate, rootDir) as typeof depth;
      const agentProfile = resolveMandateProfile(
        rootDir,
        verifiedMandate.mandate,
      );
      const budgetResult = resolveEffectiveBudgetStrict(
        verifiedMandate.mandate,
        agentProfile,
      );
      if (!budgetResult.ok) {
        return finishRun({
          input,
          deps,
          rootDir,
          runId,
          startedAt,
          actor: createOSPlayer(createInitialOSContext()),
          success: false,
          state: "failed",
          generatedFiles: [],
          feedbackMarkdown: `## Ward budget failed\n\n${budgetResult.reason}`,
          gateFailures: [],
          recordedErrors: [budgetResult.reason],
          attempts: 0,
          gateIdsFailed: [],
          firstPassGreen: false,
          approvalRequired: false,
        });
      }
      const budget = budgetResult.budget;
      wardMaxContextChars = budget.max_context_chars;
      persistRunMandate(rootDir, runId, verifiedMandate.mandate);
      writeWardRunState(rootDir, runId, {
        mandate_id: verifiedMandate.mandate.mandate_id,
        verified_at: verifiedMandate.verifiedAt,
        path_constraints: budget.path_constraints,
        actions: verifiedMandate.mandate.actions,
        max_depth: budget.max_depth,
        authorized_actor: verifiedMandate.mandate.authorized_actor,
        ...(budget.agent_id ? { agent_id: budget.agent_id } : {}),
        ...(budget.profile_hash ? { profile_hash: budget.profile_hash } : {}),
        ...(budget.max_bound_files !== undefined
          ? { max_bound_files: budget.max_bound_files }
          : {}),
        ...(budget.max_context_chars !== undefined
          ? { max_context_chars: budget.max_context_chars }
          : {}),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return finishRun({
        input,
        deps,
        rootDir,
        runId,
        startedAt,
        actor: createOSPlayer(createInitialOSContext()),
        success: false,
        state: "failed",
        generatedFiles: [],
        feedbackMarkdown: `## Ward verify failed\n\n${message}`,
        gateFailures: [],
        recordedErrors: [message],
        attempts: 0,
        gateIdsFailed: [],
        firstPassGreen: false,
        approvalRequired: false,
      });
    }
  }

  const caps = depthCapabilities(depth);

  writeIssueRunIndex(rootDir, input.issueNumber, {
    runId,
    state: resumeSnapshot ? String(resumeSnapshot.value) : "received",
    updatedAt: new Date().toISOString(),
  });

  const initialContext: OSContext = {
    ...createInitialOSContext(),
    issueNumber: input.issueNumber,
    issueTitle: input.issueTitle,
    issueBody: input.issueBody,
    maxAttempts: mandates.max_attempts,
    vibeDepth: depth,
    ...(resumeSnapshot ? resumeSnapshot.context : {}),
  };

  const actor = createOSPlayer(
    initialContext,
    resumeSnapshot ? { snapshot: resumeSnapshot } : undefined,
  );
  // Event ledger for deterministic replay (npm run replay). Legacy resumed
  // runs without a ledger cannot be replayed from an initial context, so
  // recording is disabled for them.
  const recordEvents = initializeEventLedger(
    rootDir,
    runId,
    initialContext,
    Boolean(resumeSnapshot),
  );
  const send = (event: OSEvent): void => {
    if (recordEvents) appendOsEvent(rootDir, runId, event);
    actor.send(event);
  };
  const releaseGate = resolveReleaseGatePatch(input.issueTitle, input.issueBody);
  const deterministicPatch = releaseGate?.files ?? null;
  const constitution = deps.readConstitution();
  const repoContext = deps.readRepoContext();
  seedGateFeedbackCache(rootDir);
  const vibe = `TITLE: ${input.issueTitle}\nDESCRIPTION: ${input.issueBody}`;

  appendTraceSpan(rootDir, runId, { phase: "preflight" });
  if (!pastPlanning) {
    send({ type: "preflight.completed", findings: [] });
  }

  const gateBoundFiles = releaseGate?.files.map((file) => file.path) ?? [];
  let taskBond: TaskBond | null =
    pastPlanning ? readTaskBond(rootDir, input.issueNumber) : null;

  if (!taskBond) {
    const sealed = sealTaskBond({
      issueNumber: input.issueNumber,
      issueTitle: input.issueTitle,
      issueBody: input.issueBody,
      depth,
      rootDir,
      extraBoundFiles: gateBoundFiles,
      verifiedMandate,
    });

    appendTraceSpan(rootDir, runId, {
      phase: "bond_seal",
      passed: sealed.ok,
      detail: sealed.ok ? sealed.bond.bondHash : sealed.errors.join("; "),
    });

    if (sealed.ok && verifiedMandate) {
      const wardSeal = assertWard("bond.seal", undefined, verifiedMandate, {
        rootDir,
        runId,
        house: mandates,
        actor: input.githubActor ?? approvedBy,
      });
      if (!wardSeal.ok) {
        return finishRun({
          input,
          deps,
          rootDir,
          runId,
          startedAt,
          actor,
          success: false,
          state: "failed",
          generatedFiles: [],
          feedbackMarkdown: `## Ward DENY (bond.seal)\n\n${wardSeal.decision.reason}`,
          gateFailures: [],
          recordedErrors: [wardSeal.decision.reason],
          attempts: 0,
          gateIdsFailed: [],
          firstPassGreen: false,
          approvalRequired: false,
        });
      }
    }

    if (!sealed.ok && depth >= 2) {
      const remediation = [
        "## TaskBond seal failed",
        "",
        "Fix the issue body and re-run. Required at this depth:",
        "- **Intent** (one sentence)",
        "- **Files to touch** (exact paths under allowed prefixes)",
        "",
        ...sealed.errors.map((error) => `- ${error}`),
      ].join("\n");

      return finishRun({
        input,
        deps,
        rootDir,
        runId,
        startedAt,
        actor,
        success: false,
        state: "failed",
        generatedFiles: [],
        feedbackMarkdown: remediation,
        gateFailures: [],
        recordedErrors: sealed.errors,
        attempts: 0,
        gateIdsFailed: [],
        firstPassGreen: false,
        approvalRequired: false,
      });
    }

    if (sealed.ok) {
      taskBond = sealed.bond;
      writeTaskBond(rootDir, taskBond);
    }
  }

  const boundFiles = taskBond?.boundFiles ?? gateBoundFiles;

  const lessonRecall = recallLessons(
    rootDir,
    boundFiles.length > 0 ? boundFiles : ["src/"],
    5,
    { verifiedMandate },
  );
  const failureRecall = boundFiles
    .flatMap((filePath) => readRecentFailuresByPathPrefix(rootDir, filePath, 3))
    .slice(0, 3);
  const recalledFailures = formatFailureRecall(failureRecall);

  let plan: string;
  let dag: ExecutionDag;

  if (pastPlanning && resumeSnapshot?.context.dag) {
    dag = resumeSnapshot.context.dag;
    plan = `Resumed from snapshot at ${String(resumeSnapshot.value)}`;
  } else if (releaseGate) {
    plan = releaseGate.planLines.join("\n");
    dag = {
      issueNumber: input.issueNumber,
      title: input.issueTitle,
      nodes: releaseGate.files.map((file, index) => ({
        id: `gate-${index + 1}`,
        title: `Release gate ${releaseGate.id}`,
        kind: "edit" as const,
        dependsOn: [],
        risk: riskForFiles([file.path], mandates),
        files: [file.path],
        acceptance: ["release gate satisfied"],
      })),
    };
    send({ type: "plan.created", dag });
  } else {
    const planner = resolvePlannerEndpoint();
    if (planner === "off") {
      throw new Error("Planner provider is off and no release gate matched.");
    }

    const fallbackDag: ExecutionDag = {
      issueNumber: input.issueNumber,
      title: input.issueTitle,
      nodes: [
        {
          id: "generated-edit",
          title: "Generated patch",
          kind: "edit",
          dependsOn: [],
          risk: riskForFiles(boundFiles, mandates),
          files: boundFiles,
          acceptance: ["tests pass"],
        },
      ],
    };

    const contextFiles = resolveContextFiles(rootDir, fallbackDag, boundFiles, {
      verifiedMandate,
    });
    const plannerBundle = buildContextBundle(rootDir, contextFiles, {
      ...(wardMaxContextChars !== undefined
        ? { maxTotalChars: wardMaxContextChars }
        : {}),
    });
    const contextBlob =
      boundFiles.length > 0
        ? formatContextBundleForPrompt(plannerBundle)
        : depth < 2
          ? capContext(repoContext, 16000)
          : formatContextBundleForPrompt(plannerBundle);

    const plannerSystem = depth === 0
      ? `You are a Software 3.0 Architect. Explain the request without proposing file edits.\n${constitution}`
      : `You are a Software 3.0 Architect. Follow this constitution strictly:\n${constitution}\n\nGlobal Codebase Map:\n${contextBlob}${lessonRecall.markdown}${recalledFailures ? `\n\n⚠️ RECENT STRUCTURED FAILURES FOR THESE PATHS:\n${recalledFailures}` : ""}`;

    const plannerUser =
      depth === 0
        ? `Explain how to approach this request without writing code:\n${vibe}`
        : depth === 1
          ? `Create a strict execution blueprint for this request:\n${vibe}`
          : `Create a strict execution blueprint as JSON matching this schema:
{
  "issueNumber": "${input.issueNumber}",
  "title": "${input.issueTitle}",
  "nodes": [
    {
      "id": "edit-1",
      "title": "Implement change",
      "kind": "edit",
      "dependsOn": [],
      "risk": "low",
      "files": ["src/example.ts"],
      "acceptance": ["tests pass"]
    }
  ]
}

Request:
${vibe}`;

    const rawPlan = await deps.callOpenAI(
      planner.baseUrl,
      planner.apiKey,
      planner.model,
      plannerSystem,
      plannerUser,
      depth >= 2,
    );

    plan = depth >= 2 ? rawPlan : rawPlan;
    dag = depth >= 2 ? parsePlannerDag(rawPlan, fallbackDag) : fallbackDag;
    send({ type: "plan.created", dag });
    appendTraceSpan(rootDir, runId, { phase: "planner", detail: plan.slice(0, 200) });
  }

  if (depth === 0) {
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: true,
      state: "completed",
      generatedFiles: [],
      feedbackMarkdown: plan,
      gateFailures: [],
      recordedErrors: [],
      attempts: 0,
      gateIdsFailed: [],
      firstPassGreen: true,
      approvalRequired: false,
    });
  }

  if (caps.allowsPlanWrite) {
    deps.writePlan(input.issueNumber, plan);
  }

  if (depth === 1) {
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: true,
      state: "planning",
      generatedFiles: [],
      feedbackMarkdown: "Plan recorded. Depth 1 stops before codegen.",
      gateFailures: [],
      recordedErrors: [],
      attempts: 0,
      gateIdsFailed: [],
      firstPassGreen: true,
      approvalRequired: false,
    });
  }

  const dagErrors = validateDag(dag);
  if (dagErrors.length > 0) {
    appendTraceSpan(rootDir, runId, {
      phase: "dag_validation",
      passed: false,
      detail: dagErrors.join("; "),
    });
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: false,
      state: "failed",
      generatedFiles: [],
      feedbackMarkdown: `Invalid execution DAG:\n${dagErrors.map((error) => `- ${error}`).join("\n")}`,
      gateFailures: [],
      recordedErrors: dagErrors,
      attempts: 0,
      gateIdsFailed: ["invalid_dag"],
      firstPassGreen: false,
      approvalRequired: false,
    });
  }

  try {
    dag = validateAndParseDag(dag);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: false,
      state: "failed",
      generatedFiles: [],
      feedbackMarkdown: `Invalid execution DAG schema:\n- ${message}`,
      gateFailures: [],
      recordedErrors: [message],
      attempts: 0,
      gateIdsFailed: ["invalid_dag"],
      firstPassGreen: false,
      approvalRequired: false,
    });
  }

  topologicalSort(dag.nodes);
  appendTraceSpan(rootDir, runId, { phase: "dag_validation", passed: true });

  const resumeState = resumeSnapshot ? String(resumeSnapshot.value) : null;
  const skipToCodegen =
    resumeState === "generating_patch" ||
    resumeState === "learning" ||
    (resumeState === "awaiting_approval" && Boolean(approvedBy));

  const plannedFiles =
    collectPlannedFiles(dag).length > 0
      ? collectPlannedFiles(dag)
      : releaseGate?.files.map((file) => file.path) ??
        (boundFiles.length > 0 ? boundFiles : ["src/generated.ts"]);

  const mandateEval = evaluateMandates(plannedFiles, mandates);
  if (!mandateEval.passed) {
    const feedback = mandateEval.violations
      .map((item) => `Forbidden path: ${item.path}`)
      .join("\n");
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: false,
      state: "failed",
      generatedFiles: [],
      feedbackMarkdown: feedback,
      gateFailures: [],
      recordedErrors: [feedback],
      attempts: 0,
      gateIdsFailed: ["forbidden_path"],
      firstPassGreen: false,
      approvalRequired: false,
    });
  }

  const riskReview = resolveRiskReview(plannedFiles, mandates);
  const approvalRequired =
    riskReview.approvalRequired &&
    (caps.enforcesProtectedApproval || riskReview.risk === "high");

  if (!skipToCodegen) {
    send({
      type: "risk.reviewed",
      risk: riskReview.risk,
      reason: riskReview.reason,
      approvalRequired,
    });

    if (actor.getSnapshot().value === "awaiting_approval") {
      if (approvedBy) {
        send({
          type: "approval.granted",
          actor: approvedBy,
          commentId: "env-approval",
        });
      } else {
        return finishRun({
          input,
          deps,
          rootDir,
          runId,
          startedAt,
          actor,
          success: false,
          state: String(actor.getSnapshot().value),
          generatedFiles: [],
          feedbackMarkdown: "High-risk change requires /approve before patch generation.",
          gateFailures: [],
          recordedErrors: [],
          attempts: 0,
          gateIdsFailed: [],
          firstPassGreen: false,
          approvalRequired: true,
        });
      }
    }
  } else if (approvedBy) {
    send({
      type: "approval.granted",
      actor: approvedBy,
      commentId: "env-approval",
    });
  }

  if (!caps.allowsCodegen) {
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: false,
      state: "failed",
      generatedFiles: [],
      feedbackMarkdown: `Depth ${depth} does not allow codegen.`,
      gateFailures: [],
      recordedErrors: [],
      attempts: 0,
      gateIdsFailed: [],
      firstPassGreen: false,
      approvalRequired: false,
    });
  }

  const plannedForAuth = [
    ...new Set([
      ...collectPlannedFiles(dag),
      ...boundFiles,
      ...(releaseGate?.files.map((f) => f.path) ?? []),
    ]),
  ];
  const corewardCodegen = assertCorewardMode(rootDir, "codegen", {
    paths: plannedForAuth,
    verifiedMandate,
  });
  if (!corewardCodegen.ok) {
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: false,
      state: "failed",
      generatedFiles: [],
      feedbackMarkdown: `## Coreward Mode DENY\n\n${corewardCodegen.reason}\n\nCall MCP \`authorize_write\` (or \`npm run coreward:authorize\`) or load a verified Mandate.`,
      gateFailures: [],
      recordedErrors: [corewardCodegen.reason],
      attempts: 0,
      gateIdsFailed: ["coreward_mode"],
      firstPassGreen: false,
      approvalRequired: false,
    });
  }

  let feedbackMarkdown = "";
  let gateFailures: GateFailure[] = [];
  const recordedErrors: string[] = [];
  const gateIdsFailed: string[] = [];
  let finalVerifiedFiles: GeneratedFile[] = [];
  let attempts = 0;
  let tokensEstimate = 0;
  let hallucinationBlocked = false;
  const gateHit = Boolean(deterministicPatch);

  const codegenContextFiles = resolveContextFiles(rootDir, dag, boundFiles, {
    verifiedMandate,
  });
  const codegenBundle = buildContextBundle(rootDir, codegenContextFiles, {
    ...(wardMaxContextChars !== undefined
      ? { maxTotalChars: wardMaxContextChars }
      : {}),
  });
  const allowedCodegenPaths = [...new Set([...plannedFiles, ...boundFiles])];

  while (attempts < mandates.max_attempts) {
    attempts++;
    prepareCodegenAttempt(actor, send, attempts);

    let generatedFiles: GeneratedFile[];
    if (deterministicPatch) {
      generatedFiles = deterministicPatch;
    } else {
      const codegen = resolveCodegenEndpoint();
      if (codegen === "off") {
        throw new Error("Codegen provider is off and no deterministic patch is available.");
      }

      const codePrompt = buildCodegenPrompt(
        plan,
        plannedFiles,
        feedbackMarkdown,
        codegenBundle,
      );
      const rawCode = await deps.callOpenAI(
        codegen.baseUrl,
        codegen.apiKey,
        codegen.model,
        "You are an expert xmachines coder. Output strictly valid JSON. Follow path and ESM import constraints exactly.",
        codePrompt,
        codegen.jsonMode ?? false,
      );
      tokensEstimate += estimateTokens(rawCode);

      try {
        generatedFiles = JSON.parse(rawCode).files || [];
      } catch {
        continue;
      }
    }

    if (generatedFiles.length === 0) continue;

    generatedFiles = prepareGeneratedPatch(generatedFiles);
    appendTraceSpan(rootDir, runId, {
      phase: "codegen",
      path: generatedFiles.map((file) => file.path).join(","),
    });

    if (verifiedMandate) {
      let wardDenied: string | null = null;
      for (const file of generatedFiles) {
        const wardCodegen = assertWard("codegen", file.path, verifiedMandate, {
          rootDir,
          runId,
          house: mandates,
          actor: input.githubActor ?? approvedBy,
        });
        if (!wardCodegen.ok) {
          wardDenied = wardCodegen.decision.reason;
          break;
        }
      }
      if (wardDenied) {
        gateFailures = [
          createGateFailure(
            "ward",
            generatedFiles[0]?.path ?? "",
            wardDenied,
            `Ward DENY: ${wardDenied}. Re-issue Mandate or shrink bound files.`,
          ),
        ];
        feedbackMarkdown = formatGateFailuresMarkdown(gateFailures, rootDir);
        recordedErrors.push(feedbackMarkdown);
        gateIdsFailed.push("ward");
        send({
          type: "verification.failed",
          failure: toClassifiedFailure(
            "permission",
            "Ward DENY on codegen",
            feedbackMarkdown,
          ),
        });
        if (!prepareCodegenRetry(actor, send)) break;
        continue;
      }
    }

    const validation = runGeneratedPatchValidators(generatedFiles, {
      allowedPaths: allowedCodegenPaths,
      rootDir,
      approvalGranted: Boolean(approvedBy),
    });
    if (
      validation.gateFailures.some((item) => item.gate_id === "bond_compliance")
    ) {
      hallucinationBlocked = true;
    }
    // Ax boundary: deterministic validators run before any disk write.
    appendTraceSpan(rootDir, runId, {
      phase: "validator",
      passed: validation.passed,
      gate_id: validation.gateFailures[0]?.gate_id,
      path: validation.gateFailures[0]?.analysis.path,
      detail: validation.gateFailures[0]?.analysis.detail,
    });

    if (!validation.passed) {
      gateFailures = validation.gateFailures;
      feedbackMarkdown = formatGateFailuresMarkdown(gateFailures, rootDir);
      recordedErrors.push(feedbackMarkdown);
      gateIdsFailed.push(...gateFailures.map((item) => item.gate_id));
      recordLessonFromGateFailure({
        rootDir,
        runId,
        gateFailures,
        boundFiles,
        plannedFiles,
      });
      send({
        type: "verification.failed",
        failure: toClassifiedFailure("model_output", "Generated patch validation failed", feedbackMarkdown),
      });
      if (!prepareCodegenRetry(actor, send)) break;
      continue;
    }

    if (!caps.allowsDiskWrite) {
      finalVerifiedFiles = generatedFiles;
      break;
    }

    const backups = deps.writeFilesToDisk(generatedFiles);
    let loopPassed = true;
    feedbackMarkdown = "";
    gateFailures = [];
    const verificationResults: VerificationResult[] = [];

    if (caps.allowsTests) {
      try {
        deps.runTsc();
        verificationResults.push({
          name: "tsc",
          passed: true,
          output: "Compiler check passed",
        });
        appendTraceSpan(rootDir, runId, { phase: "tsc", passed: true });
      } catch (error: unknown) {
        const errMsg = extractExecError(error);
        gateFailures.push(
          createGateFailure(
            "typescript_compiler",
            "tsconfig.json",
            errMsg,
            "Fix TypeScript compile errors before retrying.",
          ),
        );
        feedbackMarkdown = formatGateFailuresMarkdown(gateFailures, rootDir);
        recordedErrors.push(errMsg);
        gateIdsFailed.push("typescript_compiler");
        loopPassed = false;
        verificationResults.push({ name: "tsc", passed: false, output: errMsg });
        appendTraceSpan(rootDir, runId, {
          phase: "tsc",
          passed: false,
          gate_id: "typescript_compiler",
          detail: errMsg.slice(0, 500),
        });
      }

      if (loopPassed) {
        try {
          const changedPaths = generatedFiles.map((file) => file.path);
          if (
            process.env.VIBE_TEST_MODE === "subgraph" &&
            deps.runVitestSubgraph
          ) {
            deps.runVitestSubgraph(changedPaths);
          } else {
            deps.runVitest();
          }
          verificationResults.push({
            name: "vitest",
            passed: true,
            output: "Evaluation tests passed",
          });
          appendTraceSpan(rootDir, runId, { phase: "vitest", passed: true });
        } catch (error: unknown) {
          const errMsg = extractExecError(error);
          gateFailures.push(
            createGateFailure(
              "vitest",
              "tests",
              errMsg,
              "Fix failing tests before retrying.",
            ),
          );
          feedbackMarkdown = formatGateFailuresMarkdown(gateFailures, rootDir);
          recordedErrors.push(errMsg);
          gateIdsFailed.push("vitest");
          loopPassed = false;
          verificationResults.push({ name: "vitest", passed: false, output: errMsg });
          appendTraceSpan(rootDir, runId, {
            phase: "vitest",
            passed: false,
            gate_id: "vitest",
            detail: errMsg.slice(0, 500),
          });
        }
      }
    }

    if (loopPassed && deterministicPatch) {
      // Deterministic release-gate patches skip causal critic.
    } else if (loopPassed && caps.allowsTests) {
      const critic = resolveCriticEndpoint();
      if (critic.kind !== "off") {
        for (const file of generatedFiles) {
          const criticSystem = `You are a Judea Pearl Causal Critic. Codebase context:\n${repoContext}\n\nDoes this code violate xmachines invariants or break downstream logic? If safe, reply EXACTLY 'PASS'. If it fails, explain why.`;
          const criticUser = `Review this new code for ${file.path}:\n\n${file.content}`;
          const verdict =
            critic.kind === "gemini"
              ? await deps.callGemini(critic.apiKey, criticSystem, criticUser)
              : await deps.callOpenAI(
                  critic.endpoint.baseUrl,
                  critic.endpoint.apiKey,
                  critic.endpoint.model,
                  criticSystem,
                  criticUser,
                );

          if (!verdict.toUpperCase().includes("PASS")) {
            gateFailures.push(
              createGateFailure(
                "causal_critic",
                file.path,
                verdict,
                "Address the critic rejection before retrying.",
              ),
            );
            feedbackMarkdown = formatGateFailuresMarkdown(gateFailures, rootDir);
            recordedErrors.push(verdict);
            gateIdsFailed.push("causal_critic");
            loopPassed = false;
            appendTraceSpan(rootDir, runId, {
              phase: "critic",
              passed: false,
              gate_id: "causal_critic",
              path: file.path,
              detail: verdict.slice(0, 500),
            });
            break;
          }
        }
      }
    }

    if (loopPassed) {
      finalVerifiedFiles = generatedFiles;
      send({ type: "patch.generated", files: generatedFiles });
      send({ type: "verification.passed", results: verificationResults });
      if (caps.allowsDeploy) {
        send({ type: "publish.completed", previewUrl: "preview://local" });
      } else {
        send({ type: "publish.completed" });
      }

      if (attempts > 1 && recordedErrors.length > 0) {
        appendLesson(rootDir, {
          runId,
          failureClass: "retry_success",
          gate_id: gateIdsFailed[0],
          path: finalVerifiedFiles[0]?.path ?? plannedFiles[0] ?? "src/",
          symptom: recordedErrors.join("; ").slice(0, 500),
          fix: "Resolved after codegen retry",
          reuseWhen: boundFiles.length > 0 ? boundFiles : plannedFiles,
          traceSpanTs: new Date().toISOString(),
        });
        writeEvoMemExport(rootDir);
      }
      break;
    }

    deps.restoreBackups(backups);
    send({
      type: "verification.failed",
      failure: toClassifiedFailure(
        gateFailures[0]?.gate_id === "vitest" ? "test" : "compile",
        gateFailures[0]?.analysis.detail.split("\n")[0] ?? "Verification failed",
        feedbackMarkdown,
      ),
    });
    recordLessonFromGateFailure({
      rootDir,
      runId,
      gateFailures,
      boundFiles,
      plannedFiles,
    });
    if (!prepareCodegenRetry(actor, send)) break;
  }

  if (finalVerifiedFiles.length === 0) {
    deps.writeCriticFailed(
      `🚨 **System Halted.**\nFailed to pass Eval/Critic after ${mandates.max_attempts} attempts.\n\nFinal Feedback:\n${feedbackMarkdown}`,
    );
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: false,
      state: "failed",
      generatedFiles: [],
      feedbackMarkdown,
      gateFailures,
      recordedErrors,
      attempts,
      gateIdsFailed,
      firstPassGreen: false,
      tokensEstimate,
      approvalRequired: false,
      contextChars: codegenBundle.totalChars,
      truncated: codegenBundle.truncated,
      hallucinationBlocked,
      gateHit,
    });
  }

  if (verifiedMandate) {
    const wardPromote = assertWard("promote", undefined, verifiedMandate, {
      rootDir,
      runId,
      house: mandates,
      actor: input.githubActor ?? approvedBy,
    });
    if (!wardPromote.ok) {
      return finishRun({
        input,
        deps,
        rootDir,
        runId,
        startedAt,
        actor,
        success: false,
        state: "failed",
        generatedFiles: finalVerifiedFiles,
        feedbackMarkdown: `## Ward DENY (promote)\n\n${wardPromote.decision.reason}`,
        gateFailures: [],
        recordedErrors: [wardPromote.decision.reason],
        attempts,
        gateIdsFailed: [...gateIdsFailed, "ward"],
        firstPassGreen: false,
        tokensEstimate,
        approvalRequired: false,
        contextChars: codegenBundle.totalChars,
        truncated: codegenBundle.truncated,
        hallucinationBlocked,
        gateHit,
      });
    }
  }

  const corewardPromote = assertCorewardMode(rootDir, "promote", {
    paths: finalVerifiedFiles.map((f) => f.path),
    verifiedMandate,
  });
  if (!corewardPromote.ok) {
    return finishRun({
      input,
      deps,
      rootDir,
      runId,
      startedAt,
      actor,
      success: false,
      state: "failed",
      generatedFiles: finalVerifiedFiles,
      feedbackMarkdown: `## Coreward Mode DENY (promote)\n\n${corewardPromote.reason}`,
      gateFailures: [],
      recordedErrors: [corewardPromote.reason],
      attempts,
      gateIdsFailed: [...gateIdsFailed, "coreward_mode"],
      firstPassGreen: false,
      tokensEstimate,
      approvalRequired: false,
      contextChars: codegenBundle.totalChars,
      truncated: codegenBundle.truncated,
      hallucinationBlocked,
      gateHit,
    });
  }

  return finishRun({
    input,
    deps,
    rootDir,
    runId,
    startedAt,
    actor,
    success: true,
    state: String(actor.getSnapshot().value),
    generatedFiles: finalVerifiedFiles,
    feedbackMarkdown,
    gateFailures,
    recordedErrors,
    attempts,
    gateIdsFailed,
    firstPassGreen: attempts === 1 && gateIdsFailed.length === 0,
    tokensEstimate,
    approvalRequired,
    contextChars: codegenBundle.totalChars,
    truncated: codegenBundle.truncated,
    hallucinationBlocked,
    gateHit,
  });
}

type FinishRunInput = {
  input: RunInput;
  deps: RunDeps;
  rootDir: string;
  runId: string;
  startedAt: number;
  actor: OSPlayer;
  success: boolean;
  state: string;
  generatedFiles: GeneratedFile[];
  feedbackMarkdown: string;
  gateFailures: GateFailure[];
  recordedErrors: string[];
  attempts: number;
  gateIdsFailed: string[];
  firstPassGreen: boolean;
  tokensEstimate?: number;
  approvalRequired: boolean;
  bondHash?: string;
  contextChars?: number;
  truncated?: boolean;
  hallucinationBlocked?: boolean;
  gateHit?: boolean;
};

function finishRun(args: FinishRunInput): RunOutput {
  const metrics: RunMetrics = {
    attempts: args.attempts,
    firstPassGreen: args.firstPassGreen,
    gateIdsFailed: [...new Set(args.gateIdsFailed)],
    durationMs: Date.now() - args.startedAt,
    tokensEstimate: args.tokensEstimate,
    contextChars: args.contextChars,
    truncated: args.truncated,
    hallucinationBlocked: args.hallucinationBlocked,
    gateHit: args.gateHit,
  };

  const bondHash =
    args.bondHash ??
    readTaskBond(args.rootDir, args.input.issueNumber)?.bondHash;

  const manifest = buildManifest(
    args.input,
    args.generatedFiles,
    args.approvalRequired,
    args.deps,
    args.runId,
    metrics,
    args.rootDir,
    bondHash,
  );

  const snapshot = getPersistedSnapshot(args.actor);
  const capsuleHash = computeCapsuleHash({
    manifest,
    snapshot,
    traceTail: readTraceTail(args.rootDir, args.runId),
  });
  manifest.capsuleHash = capsuleHash;
  writeCapsuleHash(args.rootDir, args.runId, capsuleHash);

  appendScoreboardEntry(args.rootDir, {
    runId: manifest.runId,
    issueNumber: manifest.issueNumber,
    issueTitle: manifest.issueTitle,
    success: args.success,
    state: args.state,
    createdAt: manifest.createdAt,
    metrics,
  });

  appendTraceSpan(args.rootDir, args.runId, {
    phase: "run_complete",
    passed: args.success,
    durationMs: metrics.durationMs,
    tokensEstimate: metrics.tokensEstimate,
  });

  writeActorSnapshot(args.rootDir, args.runId, getPersistedSnapshot(args.actor));

  writeIssueRunIndex(args.rootDir, args.input.issueNumber, {
    runId: args.runId,
    state: args.state,
    updatedAt: new Date().toISOString(),
  });

  return {
    success: args.success,
    state: args.state,
    context: args.actor.getSnapshot().context,
    generatedFiles: args.generatedFiles,
    manifest,
    feedbackMarkdown: args.feedbackMarkdown,
    gateFailures: args.gateFailures,
    recordedErrors: args.recordedErrors,
  };
}

function resolveRunId(issueNumber: string, rootDir: string): string {
  const envRunId = process.env.VIBE_RUN_ID?.trim();
  if (envRunId) return sanitizeRunId(envRunId);

  const fromIndex = readIssueRunIndexForResume(rootDir, issueNumber);
  if (fromIndex) return fromIndex;

  return sanitizeRunId(
    `issue-${issueNumber}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
}

function readIssueRunIndexForResume(
  rootDir: string,
  issueNumber: string,
): string | null {
  const entry = readIssueRunIndex(rootDir, issueNumber);
  if (!entry) return null;
  if (entry.state === "completed" || entry.state === "failed") return null;
  return sanitizeRunId(entry.runId);
}

function loadResumeSnapshot(
  rootDir: string,
  runId: string,
  issueNumber: string,
): OSPlayerSnapshot | null {
  const index = readIssueRunIndex(rootDir, issueNumber);
  const resumeRequested =
    Boolean(process.env.VIBE_RUN_ID?.trim()) ||
    (index !== null &&
      index.runId === runId &&
      index.state !== "completed" &&
      index.state !== "failed");
  if (!resumeRequested) return null;

  const raw = readActorSnapshot(rootDir, runId);
  if (!raw || typeof raw !== "object") return null;

  const snapshot = raw as OSPlayerSnapshot;
  if (isTerminalSnapshot(snapshot)) return null;
  if (snapshot.context?.issueNumber !== issueNumber) return null;
  return snapshot;
}

function prepareCodegenAttempt(
  actor: OSPlayer,
  send: (event: OSEvent) => void,
  attempt: number,
) {
  const state = String(actor.getSnapshot().value);
  if (state === "learning") {
    send({ type: "codegen.retry" });
  }
  send({ type: "attempt.started", attempt });
}

function prepareCodegenRetry(
  actor: OSPlayer,
  send: (event: OSEvent) => void,
): boolean {
  const snapshot = actor.getSnapshot();
  if (snapshot.context.attempts >= snapshot.context.maxAttempts) {
    return false;
  }
  send({ type: "codegen.retry" });
  return String(actor.getSnapshot().value) === "generating_patch";
}

function isPastPlanning(snapshot: OSPlayerSnapshot | null): boolean {
  if (!snapshot) return false;
  const state = String(snapshot.value);
  if (state === "awaiting_approval") return true;
  const pastStates = new Set([
    "planning",
    "risk_review",
    "generating_patch",
    "verifying",
    "learning",
    "publishing",
  ]);
  return pastStates.has(state) && Boolean(snapshot.context?.dag);
}

function buildManifest(
  input: RunInput,
  generatedFiles: GeneratedFile[],
  approvalRequired: boolean,
  deps: RunDeps,
  runId: string,
  metrics: RunMetrics,
  rootDir: string,
  bondHash?: string,
): RunManifest {
  const paths = generatedFiles.map((file) => file.path);
  const generatedFileDigests =
    generatedFiles.length > 0
      ? Object.fromEntries(
          generatedFiles.map((file) => [file.path, sha256Content(file.content)]),
        )
      : undefined;

  return {
    runId,
    issueNumber: input.issueNumber,
    issueTitle: input.issueTitle,
    branchName: deps.getGitValue("git branch --show-current", "unknown-branch"),
    baseSha: deps.getGitValue("git rev-parse HEAD", "unknown-sha"),
    generatedFiles: paths,
    generatedFileDigests,
    createdAt: new Date().toISOString(),
    approvalRequired: approvalRequired || undefined,
    vowsHash: computeVowsHash(rootDir),
    bondHash,
    metrics,
  };
}

function buildCodegenPrompt(
  plan: string,
  requiredPaths: string[],
  feedbackMarkdown: string,
  contextBundle?: ScopedContextBundle,
): string {
  let codePrompt = `Execute this plan strictly:\n${plan}\n\nOutput ONLY valid JSON matching this schema:
        {
          "files": [
            {"path": "src/example.ts", "content": "source code"},
            {"path": "src/example.test.ts", "content": "Vitest evaluation code"}
          ]
        }

        Hard constraints:
        - Use only paths under src/, tests/, .planning/, or .skills/ (exact filenames from the plan).
        - In TypeScript files, local ESM imports MUST use a .js extension (e.g. import { x } from "./example.js").
        - Do not emit markdown fences or commentary outside the JSON object.`;

  if (contextBundle && contextBundle.files.length > 0) {
    codePrompt += `\n\n## Existing source (read-only)\n${formatContextBundleForPrompt(contextBundle)}`;
  }

  if (requiredPaths.length > 0) {
    codePrompt += `\n\nRequired output files (use these exact paths):\n${requiredPaths.join("\n")}`;
  }
  if (feedbackMarkdown) {
    codePrompt += `\n\n🚨 PREVIOUS ATTEMPT FAILED. Fix these exact errors:\n${feedbackMarkdown}`;
  }
  return codePrompt;
}

function recordLessonFromGateFailure(args: {
  rootDir: string;
  runId: string;
  gateFailures: GateFailure[];
  boundFiles: string[];
  plannedFiles: string[];
}): void {
  const failure = args.gateFailures[0];
  if (!failure) return;

  appendLesson(args.rootDir, {
    runId: args.runId,
    failureClass: failure.gate_id,
    gate_id: failure.gate_id,
    path: failure.analysis.path,
    symptom: failure.analysis.detail.slice(0, 500),
    fix: failure.remediation_instruction,
    reuseWhen:
      args.boundFiles.length > 0 ? args.boundFiles : args.plannedFiles,
    traceSpanTs: new Date().toISOString(),
  });
  writeEvoMemExport(args.rootDir);

  // Live L1 seed: grow feedback-cache from production gate failures (not only static seeds).
  // Never writes mandates/gates/VOWS — cache only.
  writeGateFeedbackEntry(args.rootDir, {
    gate_id: failure.gate_id,
    remediation_instruction: failure.remediation_instruction,
    examples: [
      `${failure.analysis.path}: ${failure.analysis.detail.slice(0, 240)}`,
    ],
  });
}

export { dedupeLines, capContext } from "../context/cap.js";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function toClassifiedFailure(
  failureClass: ClassifiedFailure["failureClass"],
  symptom: string,
  output: string,
): ClassifiedFailure {
  return { failureClass, symptom, output };
}

function extractExecError(error: unknown): string {
  if (error && typeof error === "object" && "stdout" in error) {
    return String((error as { stdout?: Buffer }).stdout ?? "Unknown exec error");
  }
  return error instanceof Error ? error.message : String(error);
}

function getGitValue(command: string, fallback: string) {
  try {
    return execSync(command, { stdio: "pipe" }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}

function writeFilesToDisk(
  files: GeneratedFile[],
  rootDir = ".",
): Map<string, string | null> {
  const backups = new Map<string, string | null>();
  for (const file of files) {
    const filepath = path.isAbsolute(file.path)
      ? file.path
      : path.join(rootDir, file.path);
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    backups.set(
      filepath,
      fs.existsSync(filepath) ? fs.readFileSync(filepath, "utf8") : null,
    );
    fs.writeFileSync(filepath, file.content);
  }
  return backups;
}

function restoreBackups(backups: Map<string, string | null>) {
  for (const [filepath, oldContent] of backups.entries()) {
    if (oldContent === null) {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    } else {
      fs.writeFileSync(filepath, oldContent);
    }
  }
}

async function callOpenAIFormat(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  jsonMode = false,
) {
  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) payload.response_format = { type: "json_object" };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`API Error from ${baseUrl}: ${res.statusText}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0].message.content;
}

async function callGeminiFormat(apiKey: string, system: string, user: string) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
  const payload = {
    system_instruction: { parts: { text: system } },
    contents: [{ parts: [{ text: user }] }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0].content.parts[0].text;
}
