import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { createActor } from "xstate";
import { riskForFiles } from "../planning/dag.js";
import { loadMandates } from "../policy/evaluate.js";
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
import { createInitialOSContext, createOSMachine } from "./machine.js";
import type {
  ClassifiedFailure,
  GeneratedFile,
  OSContext,
  VerificationResult,
} from "./events.js";
import type { RunManifest } from "../run/manifest.js";

export type RunInput = {
  issueNumber: string;
  issueTitle: string;
  issueBody: string;
  githubActor?: string;
  approvedBy?: string;
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
  appendEvoMem: (content: string) => void;
  writeCriticFailed: (content: string) => void;
};

function defaultDeps(): RunDeps {
  return {
    callOpenAI: callOpenAIFormat,
    callGemini: callGeminiFormat,
    getGitValue,
    readConstitution: () => {
      const constitutionPath = fs.existsSync("AGENTS.md") ? "AGENTS.md" : "agent.md";
      return fs.readFileSync(constitutionPath, "utf8");
    },
    readRepoContext: () =>
      fs.existsSync("repomix-output.txt")
        ? fs.readFileSync("repomix-output.txt", "utf8")
        : "Repository is currently empty.",
    readEvoMem: () =>
      fs.existsSync("EVOMEM.md") ? fs.readFileSync("EVOMEM.md", "utf8") : "",
    writePlan: (issueNumber, plan) => {
      const planDir = ".planning/milestones";
      if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
      fs.writeFileSync(path.join(planDir, `ISSUE_${issueNumber}_PLAN.md`), plan);
    },
    writeFilesToDisk,
    restoreBackups,
    runTsc: () => {
      if (fs.existsSync("tsconfig.json")) {
        execSync("npx tsc --noEmit", { stdio: "pipe" });
      }
    },
    runVitest: () => execSync("npx vitest run", { stdio: "pipe" }),
    appendEvoMem: (content) => fs.appendFileSync("EVOMEM.md", content, "utf8"),
    writeCriticFailed: (content) => fs.writeFileSync("CRITIC_FAILED.md", content),
  };
}

export async function runOSActor(
  input: RunInput,
  deps: RunDeps = defaultDeps(),
): Promise<RunOutput> {
  const mandates = loadMandates();
  const initialContext: OSContext = {
    ...createInitialOSContext(),
    issueNumber: input.issueNumber,
    issueTitle: input.issueTitle,
    issueBody: input.issueBody,
    maxAttempts: mandates.max_attempts,
  };

  const actor = createActor(createOSMachine(initialContext)).start();
  const releaseGate = resolveReleaseGatePatch(input.issueTitle, input.issueBody);
  const deterministicPatch = releaseGate?.files ?? null;
  const constitution = deps.readConstitution();
  const repoContext = deps.readRepoContext();
  const evoMemContext = deps.readEvoMem();
  const vibe = `TITLE: ${input.issueTitle}\nDESCRIPTION: ${input.issueBody}`;
  const requiredPaths = extractRequiredPaths(input.issueBody);

  actor.send({ type: "preflight.completed", findings: [] });

  let plan: string;
  if (releaseGate) {
    plan = releaseGate.planLines.join("\n");
    actor.send({
      type: "plan.created",
      dag: {
        issueNumber: input.issueNumber,
        title: input.issueTitle,
        nodes: releaseGate.files.map((file, index) => ({
          id: `gate-${index + 1}`,
          title: `Release gate ${releaseGate.id}`,
          kind: "edit" as const,
          dependsOn: [],
          risk: riskForFiles([file.path]),
          files: [file.path],
          acceptance: ["release gate satisfied"],
        })),
      },
    });
  } else {
    const planner = resolvePlannerEndpoint();
    if (planner === "off") {
      throw new Error("Planner provider is off and no release gate matched.");
    }

    plan = await deps.callOpenAI(
      planner.baseUrl,
      planner.apiKey,
      planner.model,
      `You are a Software 3.0 Architect. Follow this constitution strictly:\n${constitution}\n\nGlobal Codebase Map:\n${capContext(repoContext, 16000)}${capContext(evoMemContext ? `\n\n⚠️ HISTORICAL RUNTIME ERRORS TO AVOID:\n${evoMemContext}` : "", 2000)}`,
      `Create a strict execution blueprint for this request:\n${vibe}`,
    );

    actor.send({
      type: "plan.created",
      dag: {
        issueNumber: input.issueNumber,
        title: input.issueTitle,
        nodes: [
          {
            id: "generated-edit",
            title: "Generated patch",
            kind: "edit",
            dependsOn: [],
            risk: riskForFiles(requiredPaths),
            files: requiredPaths,
            acceptance: ["tests pass"],
          },
        ],
      },
    });
  }

  deps.writePlan(input.issueNumber, plan);

  const plannedFiles =
    releaseGate?.files.map((file) => file.path) ??
    requiredPaths.length > 0
      ? requiredPaths
      : ["src/generated.ts"];
  const risk = riskForFiles(plannedFiles);
  const riskReason =
    risk === "high"
      ? "Protected workflow or high-risk path in planned files"
      : risk === "medium"
        ? "Package manifest mutation in planned files"
        : "Generated source-only edit";

  actor.send({ type: "risk.reviewed", risk, reason: riskReason });

  if (actor.getSnapshot().value === "awaiting_approval") {
    if (input.approvedBy) {
      actor.send({
        type: "approval.granted",
        actor: input.approvedBy,
        commentId: "env-approval",
      });
    } else {
      const manifest = buildManifest(input, [], true, deps);
      return {
        success: false,
        state: String(actor.getSnapshot().value),
        context: actor.getSnapshot().context,
        generatedFiles: [],
        manifest,
        feedbackMarkdown: "High-risk change requires /approve before patch generation.",
        gateFailures: [],
        recordedErrors: [],
      };
    }
  }

  let feedbackMarkdown = "";
  let gateFailures: GateFailure[] = [];
  const recordedErrors: string[] = [];
  let finalVerifiedFiles: GeneratedFile[] = [];
  let attempts = 0;

  while (attempts < mandates.max_attempts) {
    attempts++;
    actor.getSnapshot().context.attempts = attempts;

    let generatedFiles: GeneratedFile[];
    if (deterministicPatch && attempts === 1) {
      generatedFiles = deterministicPatch;
    } else {
      const codegen = resolveCodegenEndpoint();
      if (codegen === "off") {
        throw new Error("Codegen provider is off and no deterministic patch is available.");
      }

      let codePrompt = buildCodegenPrompt(plan, requiredPaths, feedbackMarkdown);
      const rawCode = await deps.callOpenAI(
        codegen.baseUrl,
        codegen.apiKey,
        codegen.model,
        "You are an expert xmachines coder. Output strictly valid JSON. Follow path and ESM import constraints exactly.",
        codePrompt,
        codegen.jsonMode ?? false,
      );

      try {
        generatedFiles = JSON.parse(rawCode).files || [];
      } catch {
        continue;
      }
    }

    if (generatedFiles.length === 0) continue;

    generatedFiles = prepareGeneratedPatch(generatedFiles);

    // Ax boundary: deterministic validators run before any disk write.
    const validation = runGeneratedPatchValidators(generatedFiles);
    if (!validation.passed) {
      gateFailures = validation.gateFailures;
      feedbackMarkdown = formatGateFailuresMarkdown(gateFailures);
      recordedErrors.push(feedbackMarkdown);
      actor.send({
        type: "verification.failed",
        failure: toClassifiedFailure("model_output", "Generated patch validation failed", feedbackMarkdown),
      });
      continue;
    }

    const backups = deps.writeFilesToDisk(generatedFiles);
    let loopPassed = true;
    feedbackMarkdown = "";
    gateFailures = [];
    const verificationResults: VerificationResult[] = [];

    try {
      deps.runTsc();
      verificationResults.push({
        name: "tsc",
        passed: true,
        output: "Compiler check passed",
      });
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
      loopPassed = false;
      verificationResults.push({ name: "tsc", passed: false, output: errMsg });
    }

    if (loopPassed) {
      try {
        deps.runVitest();
        verificationResults.push({
          name: "vitest",
          passed: true,
          output: "Evaluation tests passed",
        });
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
        loopPassed = false;
        verificationResults.push({ name: "vitest", passed: false, output: errMsg });
      }
    }

    if (loopPassed && deterministicPatch && attempts === 1) {
      // Deterministic release-gate patches skip causal critic.
    } else if (loopPassed) {
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
            loopPassed = false;
            break;
          }
        }
      }
    }

    if (loopPassed) {
      finalVerifiedFiles = generatedFiles;
      actor.send({ type: "patch.generated", files: generatedFiles });
      actor.send({ type: "verification.passed", results: verificationResults });
      actor.send({ type: "publish.completed" });

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
  }

  if (finalVerifiedFiles.length === 0) {
    deps.writeCriticFailed(
      `🚨 **System Halted.**\nFailed to pass Eval/Critic after ${mandates.max_attempts} attempts.\n\nFinal Feedback:\n${feedbackMarkdown}`,
    );
    return {
      success: false,
      state: "failed",
      context: actor.getSnapshot().context,
      generatedFiles: [],
      feedbackMarkdown,
      gateFailures,
      recordedErrors,
    };
  }

  const approvalRequired = risk === "high";
  const manifest = buildManifest(
    input,
    finalVerifiedFiles.map((file) => file.path),
    approvalRequired,
    deps,
  );

  return {
    success: true,
    state: String(actor.getSnapshot().value),
    context: actor.getSnapshot().context,
    generatedFiles: finalVerifiedFiles,
    manifest,
    feedbackMarkdown,
    gateFailures,
    recordedErrors,
  };
}

function buildManifest(
  input: RunInput,
  generatedFiles: string[],
  approvalRequired: boolean,
  deps: RunDeps,
): RunManifest {
  const runId = `issue-${input.issueNumber}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  return {
    runId,
    issueNumber: input.issueNumber,
    issueTitle: input.issueTitle,
    branchName: deps.getGitValue("git branch --show-current", "unknown-branch"),
    baseSha: deps.getGitValue("git rev-parse HEAD", "unknown-sha"),
    generatedFiles,
    createdAt: new Date().toISOString(),
    approvalRequired: approvalRequired || undefined,
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

function writeFilesToDisk(files: GeneratedFile[]): Map<string, string | null> {
  const backups = new Map<string, string | null>();
  for (const file of files) {
    const dir = path.dirname(file.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    backups.set(
      file.path,
      fs.existsSync(file.path) ? fs.readFileSync(file.path, "utf8") : null,
    );
    fs.writeFileSync(file.path, file.content);
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    system_instruction: { parts: { text: system } },
    contents: [{ parts: [{ text: user }] }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0].content.parts[0].text;
}
