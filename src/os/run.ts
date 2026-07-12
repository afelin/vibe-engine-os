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
  VerificationResult,
} from "./events.js";
import {
  appendScoreboardEntry,
  readActorSnapshot,
  type RunManifest,
  type RunMetrics,
  writeActorSnapshot,
} from "../run/manifest.js";
import { buildScopedRepomix } from "../context/scoped-repomix.js";
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
import { sha256Content } from "../run/promotion.js";
import { sealTaskBond, type TaskBond } from "../bond/seal.js";
import { readTaskBond, writeTaskBond } from "../bond/store.js";

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
  const depth = getVibeDepth();
  const caps = depthCapabilities(depth);
  const mandates = loadMandates(rootDir);
  const runId = resolveRunId(input.issueNumber, rootDir);
  const persistedApproval = readPersistedApproval(rootDir, input.issueNumber);
  const approvedBy =
    input.approvedBy ?? persistedApproval?.approvedBy ?? undefined;
  const resumeSnapshot = loadResumeSnapshot(rootDir, runId, input.issueNumber);
  const pastPlanning = isPastPlanning(resumeSnapshot);

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
  const releaseGate = resolveReleaseGatePatch(input.issueTitle, input.issueBody);
  const deterministicPatch = releaseGate?.files ?? null;
  const constitution = deps.readConstitution();
  const repoContext = deps.readRepoContext();
  const evoMemContext = deps.readEvoMem();
  const vibe = `TITLE: ${input.issueTitle}\nDESCRIPTION: ${input.issueBody}`;

  appendTraceSpan(rootDir, runId, { phase: "preflight" });
  if (!pastPlanning) {
    actor.send({ type: "preflight.completed", findings: [] });
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
    });

    appendTraceSpan(rootDir, runId, {
      phase: "bond_seal",
      passed: sealed.ok,
      detail: sealed.ok ? sealed.bond.bondHash : sealed.errors.join("; "),
    });

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
    actor.send({ type: "plan.created", dag });
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

    const scopedContext = buildScopedRepomix(rootDir, fallbackDag);
    const contextBlob =
      boundFiles.length > 0
        ? scopedContext
        : depth < 2
          ? capContext(repoContext, 16000)
          : scopedContext;

    const plannerSystem = depth === 0
      ? `You are a Software 3.0 Architect. Explain the request without proposing file edits.\n${constitution}`
      : `You are a Software 3.0 Architect. Follow this constitution strictly:\n${constitution}\n\nGlobal Codebase Map:\n${contextBlob}${capContext(evoMemContext ? `\n\n⚠️ HISTORICAL RUNTIME ERRORS TO AVOID:\n${evoMemContext}` : "", 2000)}${recalledFailures ? `\n\n⚠️ RECENT STRUCTURED FAILURES FOR THESE PATHS:\n${recalledFailures}` : ""}`;

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
    actor.send({ type: "plan.created", dag });
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
    resumeState === "generating_patch" || resumeState === "learning";

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
    actor.send({
      type: "risk.reviewed",
      risk: riskReview.risk,
      reason: riskReview.reason,
      approvalRequired,
    });

    if (actor.getSnapshot().value === "awaiting_approval") {
      if (approvedBy) {
        actor.send({
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
    actor.send({
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

  let feedbackMarkdown = "";
  let gateFailures: GateFailure[] = [];
  const recordedErrors: string[] = [];
  const gateIdsFailed: string[] = [];
  let finalVerifiedFiles: GeneratedFile[] = [];
  let attempts = 0;
  let tokensEstimate = 0;

  while (attempts < mandates.max_attempts) {
    attempts++;
    prepareCodegenAttempt(actor, attempts);

    let generatedFiles: GeneratedFile[];
    if (deterministicPatch) {
      generatedFiles = deterministicPatch;
    } else {
      const codegen = resolveCodegenEndpoint();
      if (codegen === "off") {
        throw new Error("Codegen provider is off and no deterministic patch is available.");
      }

      const codePrompt = buildCodegenPrompt(plan, plannedFiles, feedbackMarkdown);
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

    const validation = runGeneratedPatchValidators(generatedFiles);
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
      feedbackMarkdown = formatGateFailuresMarkdown(gateFailures);
      recordedErrors.push(feedbackMarkdown);
      gateIdsFailed.push(...gateFailures.map((item) => item.gate_id));
      actor.send({
        type: "verification.failed",
        failure: toClassifiedFailure("model_output", "Generated patch validation failed", feedbackMarkdown),
      });
      if (!prepareCodegenRetry(actor)) break;
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
        feedbackMarkdown = formatGateFailuresMarkdown(gateFailures);
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
          feedbackMarkdown = formatGateFailuresMarkdown(gateFailures);
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
            feedbackMarkdown = formatGateFailuresMarkdown(gateFailures);
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
      actor.send({ type: "patch.generated", files: generatedFiles });
      actor.send({ type: "verification.passed", results: verificationResults });
      if (caps.allowsDeploy) {
        actor.send({ type: "publish.completed", previewUrl: "preview://local" });
      } else {
        actor.send({ type: "publish.completed" });
      }

      if (attempts > 1 && recordedErrors.length > 0) {
        deps.appendEvoMem(
          `\n- [Issue #${input.issueNumber}] Resolved runtime failures during iteration:\n  ${recordedErrors.join("\n  ")}\n`,
        );
      }
      break;
    }

    deps.restoreBackups(backups);
    actor.send({
      type: "verification.failed",
      failure: toClassifiedFailure(
        gateFailures[0]?.gate_id === "vitest" ? "test" : "compile",
        gateFailures[0]?.analysis.detail.split("\n")[0] ?? "Verification failed",
        feedbackMarkdown,
      ),
    });
    if (!prepareCodegenRetry(actor)) break;
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
};

function finishRun(args: FinishRunInput): RunOutput {
  const metrics: RunMetrics = {
    attempts: args.attempts,
    firstPassGreen: args.firstPassGreen,
    gateIdsFailed: [...new Set(args.gateIdsFailed)],
    durationMs: Date.now() - args.startedAt,
    tokensEstimate: args.tokensEstimate,
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

function resolveRunId(issueNumber: string, _rootDir: string): string {
  const envRunId = process.env.VIBE_RUN_ID?.trim();
  if (envRunId) return sanitizeRunId(envRunId);
  return sanitizeRunId(
    `issue-${issueNumber}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
}

function loadResumeSnapshot(
  rootDir: string,
  runId: string,
  issueNumber: string,
): OSPlayerSnapshot | null {
  if (!process.env.VIBE_RUN_ID?.trim()) return null;

  const raw = readActorSnapshot(rootDir, runId);
  if (!raw || typeof raw !== "object") return null;

  const snapshot = raw as OSPlayerSnapshot;
  if (isTerminalSnapshot(snapshot)) return null;
  if (snapshot.context?.issueNumber !== issueNumber) return null;
  return snapshot;
}

function prepareCodegenAttempt(actor: OSPlayer, attempt: number) {
  const state = String(actor.getSnapshot().value);
  if (state === "learning") {
    actor.send({ type: "codegen.retry" });
  }
  actor.send({ type: "attempt.started", attempt });
}

function prepareCodegenRetry(actor: OSPlayer): boolean {
  const snapshot = actor.getSnapshot();
  if (snapshot.context.attempts >= snapshot.context.maxAttempts) {
    return false;
  }
  actor.send({ type: "codegen.retry" });
  return String(actor.getSnapshot().value) === "generating_patch";
}

function isPastPlanning(snapshot: OSPlayerSnapshot | null): boolean {
  if (!snapshot) return false;
  const state = String(snapshot.value);
  const pastStates = new Set([
    "planning",
    "risk_review",
    "awaiting_approval",
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

function extractRequiredPaths(body: string): string[] {
  const patterns = [
    /\bsrc\/[\w./-]+\.ts\b/g,
    /\btests\/[\w./-]+\.ts\b/g,
    /\.github\/[\w./-]+/g,
    /\bpackage\.json\b/g,
  ];
  const paths = patterns.flatMap((pattern) =>
    [...body.matchAll(pattern)].map((match) => match[0]),
  );
  return [...new Set(paths)];
}

function buildCodegenPrompt(
  plan: string,
  requiredPaths: string[],
  feedbackMarkdown: string,
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

  if (requiredPaths.length > 0) {
    codePrompt += `\n\nRequired output files (use these exact paths):\n${requiredPaths.join("\n")}`;
  }
  if (feedbackMarkdown) {
    codePrompt += `\n\n🚨 PREVIOUS ATTEMPT FAILED. Fix these exact errors:\n${feedbackMarkdown}`;
  }
  return codePrompt;
}

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

function capContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n\n…[context truncated: ${omitted} chars omitted to fit model input limits]`;
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
