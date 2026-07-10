import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { appendOperatorEvent } from './src/os/event-ledger.js';
import { renderCockpitComment } from './src/operator/cockpit.js';
import { routeGitHubComment } from './src/operator/github-comment-router.js';
import { publishCockpitComment, resolveGitHubCommentTarget } from './src/publishing/github-comments.js';
import { renderRollbackInstructions, writeRunManifest } from './src/run/manifest.js';
import { readLatestRollbackInstructions } from './src/run/rollback.js';
import { runGeneratedPatchValidators, prepareGeneratedPatch } from './src/verification/pipeline.js';

process.on("uncaughtException", (error: Error) => {
    console.error("Fatal uncaught exception:", error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
});

// --- 1. SETUP & SECRETS ---
const GH_MODELS_TOKEN = process.env.GH_MODELS_TOKEN!;
const GROQ_KEY = process.env.GROQ_API_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER || "000";
const ISSUE_TITLE = process.env.ISSUE_TITLE || "Vibe Request";
const ISSUE_BODY = process.env.ISSUE_BODY || "No details provided.";
const GITHUB_ACTOR = process.env.GITHUB_ACTOR || "unknown-actor";
const GITHUB_COMMENT_ID = process.env.GITHUB_COMMENT_ID || process.env.GITHUB_RUN_ID || "unknown-comment";

// --- 2. UNIVERSAL API ROUTER ---
async function callOpenAIFormat(baseUrl: string, apiKey: string, model: string, system: string, user: string, jsonMode = false) {
    const payload: any = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
    if (jsonMode) payload.response_format = { type: "json_object" };
    
    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error(`API Error from ${baseUrl}: ${res.statusText}`);
    const data = await res.json();
    return data.choices[0].message.content;
}

async function callGemini(apiKey: string, system: string, user: string) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = { system_instruction: { parts: { text: system } }, contents: [{ parts: [{ text: user }] }] };
    
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
}

// GitHub Models (gpt-4o) rejects oversized requests with HTTP 413 "Payload Too Large".
// The repomix codebase map grows with the repo, so cap large context blocks to keep
// the planner request within the provider's input budget instead of crashing Phase 1.
function capContext(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const omitted = text.length - maxChars;
    return `${text.slice(0, maxChars)}\n\n…[context truncated: ${omitted} chars omitted to fit model input limits]`;
}

// --- 3. THE AUTONOMOUS OS ENGINE ---
async function runOS() {
    console.log(`\n🚀 Booting Vibe Engine OS for Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);
    
    // 1. Load System Memory
    const constitutionPath = fs.existsSync("AGENTS.md") ? "AGENTS.md" : "agent.md";
    const constitution = fs.readFileSync(constitutionPath, 'utf8');
    let repoContext = "Repository is currently empty.";
    if (fs.existsSync('repomix-output.txt')) repoContext = fs.readFileSync('repomix-output.txt', 'utf8');

    // Load Evolutionary Memory historical logs if they exist
    let evoMemContext = "";
    if (fs.existsSync('EVOMEM.md')) {
        evoMemContext = `\n\n⚠️ HISTORICAL RUNTIME ERRORS TO AVOID:\n${fs.readFileSync('EVOMEM.md', 'utf8')}`;
    }

    const vibe = `TITLE: ${ISSUE_TITLE}\nDESCRIPTION: ${ISSUE_BODY}`;

    if (isOperatorCommentEvent()) {
        const route = routeGitHubComment({
            body: ISSUE_BODY,
            actor: GITHUB_ACTOR,
            commentId: GITHUB_COMMENT_ID,
            state: "operator_command",
            context: {
                issueNumber: ISSUE_NUMBER,
                issueTitle: ISSUE_TITLE,
                issueBody: ISSUE_BODY,
                attempts: 0,
                maxAttempts: 3,
                findings: [],
                generatedFiles: [],
                verificationResults: [],
                failures: [],
            },
            readRollback: () => readLatestRollbackInstructions("."),
        });

        if (route.handled) {
            console.log(`🧭 Operator command routed as typed event: ${route.event.type}`);
            appendOperatorEvent(".", route.event);
            markOperatorOnlyFromEnv();
            await publishCommentBodyFromEnv(route.responseBody);
            return;
        }
    }

    // --- PHASE 1: SYSTEM 2 PLANNER (gpt-4o) ---
    // gpt-4o via GitHub Models has a small input budget; trim the codebase map and
    // EvoMem so the request body never trips the HTTP 413 "Payload Too Large" gate.
    const PLANNER_MAP_BUDGET = 16000;
    const PLANNER_EVOMEM_BUDGET = 2000;
    console.log("\n🧠 Phase 1: Planning Architecture (Reading global context)...");
    const plan = await callOpenAIFormat(
        "https://models.inference.ai.azure.com", GH_MODELS_TOKEN, "gpt-4o",
        `You are a Software 3.0 Architect. Follow this constitution strictly:\n${constitution}\n\nGlobal Codebase Map:\n${capContext(repoContext, PLANNER_MAP_BUDGET)}${capContext(evoMemContext, PLANNER_EVOMEM_BUDGET)}`,
        `Create a strict execution blueprint for this request:\n${vibe}`
    );
    
    const planDir = '.planning/milestones';
    if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, `ISSUE_${ISSUE_NUMBER}_PLAN.md`), plan);
    console.log("✔️ Blueprint saved to immutable ledger.");

    // --- PHASE 2: INFERENCE-TIME COMPUTE RATCHET LOOP ---
    console.log("\n⚡ Phase 2: Entering Inference-Time Compute Ratchet...");
    const requiredPaths = [...ISSUE_BODY.matchAll(/\bsrc\/[\w.-]+\.ts\b/g)].map((match) => match[0]);
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let finalVerifiedFiles: any[] = [];
    let feedback = ""; 
    let recordedErrors: string[] = [];

    while (attempts < MAX_ATTEMPTS) {
        attempts++;
        console.log(`\n🔄 Inference Loop ${attempts}/${MAX_ATTEMPTS}...`);
        
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

        if (feedback !== "") codePrompt += `\n\n🚨 PREVIOUS ATTEMPT FAILED. Fix these exact errors:\n${feedback}`;

        // 1. Code Generation (Groq / llama-3.3-70b)
        const rawCode = await callOpenAIFormat(
            "https://api.groq.com/openai/v1", GROQ_KEY, "llama-3.3-70b-versatile",
            "You are an expert xmachines coder. Output strictly valid JSON. Follow path and ESM import constraints exactly.", codePrompt, true
        );
        
        let generatedFiles;
        try {
            generatedFiles = JSON.parse(rawCode).files || [];
        } catch (error: any) {
            console.error("JSON Parsing failed this iteration:", error.message);
            continue;
        }
        if (generatedFiles.length === 0) continue;

        generatedFiles = prepareGeneratedPatch(generatedFiles);

        const validation = runGeneratedPatchValidators(generatedFiles);
        if (!validation.passed) {
            const errMsg = validation.failures.join("\n");
            console.error("❌ Generated Patch Validation Failed.");
            console.error(errMsg);
            feedback += `Generated Patch Validation Failed:\n${errMsg}\n`;
            recordedErrors.push(errMsg);
            continue;
        }

        // 2. Snapshot current disk state (for rollback safety)
        console.log("💾 Writing temporary files for verification...");
        const backups = new Map<string, string | null>();
        for (const file of generatedFiles) {
            const dir = path.dirname(file.path);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            if (fs.existsSync(file.path)) backups.set(file.path, fs.readFileSync(file.path, 'utf8'));
            else backups.set(file.path, null);
            
            fs.writeFileSync(file.path, file.content);
        }

        let loopPassed = true;
        feedback = "";

        // 3. DETERMINISTIC COMPILER CRITIC (TypeScript)
        try {
            console.log("⚙️ Running Deterministic Compiler Check (tsc --noEmit)...");
            if (fs.existsSync('tsconfig.json')) execSync('npx tsc --noEmit', { stdio: 'pipe' });
            console.log("✔️ Compiler Check Passed.");
        } catch (error: any) {
            console.error("❌ Compiler Check Failed.");
            const errMsg = error.stdout?.toString() || "Unknown compile error";
            feedback += `TypeScript Compiler Error:\n${errMsg}\n`;
            recordedErrors.push(errMsg);
            loopPassed = false;
        }

        // 4. DETERMINISTIC EVALUATION (Vitest Execution Physics)
        if (loopPassed) {
            try {
                console.log("🧪 Running Execution Evals (Vitest)...");
                execSync('npx vitest run', { stdio: 'pipe' });
                console.log("✔️ Evaluation Tests Passed.");
            } catch (error: any) {
                console.error("❌ Evaluation Tests Failed.");
                const errMsg = error.stdout?.toString() || "Test suit failed execution";
                feedback += `Test Execution Failed:\n${errMsg}\n`;
                recordedErrors.push(errMsg);
                loopPassed = false;
            }
        }

        // 5. PEARL'S CAUSAL CRITIC (Gemini-1.5-Flash)
        if (loopPassed) {
            console.log("🛡️ Running Causal Do-Calculus Verification...");
            for (const file of generatedFiles) {
                const criticSystem = `You are a Judea Pearl Causal Critic. Codebase context:\n${repoContext}\n\nDoes this code violate xmachines invariants or break downstream logic? If safe, reply EXACTLY 'PASS'. If it fails, explain why.`;
                const criticUser = `Review this new code for ${file.path}:\n\n${file.content}`;
                const verdict = await callGemini(GEMINI_KEY, criticSystem, criticUser);
                
                if (!verdict.toUpperCase().includes("PASS")) {
                    console.error(`❌ Critic Rejected ${file.path}`);
                    feedback += `File ${file.path} Failed: ${verdict}\n`;
                    recordedErrors.push(verdict);
                    loopPassed = false;
                    break; 
                }
            }
        }

        // 6. RATCHET DECISION: Keep or Rollback?
        if (loopPassed) {
            finalVerifiedFiles = generatedFiles;
            console.log("\n✅ Mathematical, Execution, and Causal verification complete. Ratchet locked.");
            
            // If we recovered from failures on previous loops, log the lessons to EvoMem
            if (attempts > 1 && recordedErrors.length > 0) {
                console.log("📝 Writing self-healing lessons to EvoMem Ledger...");
                const lessons = `\n- [Issue #${ISSUE_NUMBER}] Resolved runtime failures during iteration:\n  ${recordedErrors.join('\n  ')}\n`;
                fs.appendFileSync('EVOMEM.md', lessons, 'utf8');
            }
            break; 
        } else {
            console.log("⚠️ Ratchet slipped. Rolling back files and feeding errors to Groq...");
            for (const [filepath, oldContent] of backups.entries()) {
                if (oldContent === null) {
                    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
                } else {
                    fs.writeFileSync(filepath, oldContent);
                }
            }
        }
    }

    // --- PHASE 3: CIRCUIT BREAKER & EXIT ---
    if (finalVerifiedFiles.length === 0) {
        console.error("\n🛑 Circuit Breaker Tripped: AI could not self-heal after 3 attempts.");
        fs.writeFileSync('CRITIC_FAILED.md', `🚨 **System Halted.**\nFailed to pass Eval/Critic after ${MAX_ATTEMPTS} attempts.\n\nFinal Feedback:\n${feedback}`);
        await publishCockpitFromEnv("failed", {
            generatedFiles: [],
            failures: recordedErrors.map((error) => ({
                failureClass: "model_output",
                symptom: error.split("\n")[0] || "Circuit breaker tripped",
                output: error,
            })),
            attempts,
            maxAttempts: MAX_ATTEMPTS,
        });
        process.exit(1);
    }

    const runId = `issue-${ISSUE_NUMBER}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const branchName = getGitValue("git branch --show-current", "unknown-branch");
    const baseSha = getGitValue("git rev-parse HEAD", "unknown-sha");
    const manifest = {
        runId,
        issueNumber: ISSUE_NUMBER,
        issueTitle: ISSUE_TITLE,
        branchName,
        baseSha,
        generatedFiles: finalVerifiedFiles.map((file) => file.path),
        createdAt: new Date().toISOString(),
    };
    writeRunManifest(".", manifest);
    fs.writeFileSync(
        path.join(".runs", runId, "ROLLBACK.md"),
        renderRollbackInstructions(manifest),
    );
    console.log(`🧭 Run manifest recorded: .runs/${runId}/manifest.json`);
    await publishCockpitFromEnv("completed", {
        generatedFiles: finalVerifiedFiles,
        failures: [],
        attempts,
        maxAttempts: MAX_ATTEMPTS,
    });

    // Extract Skills automatically for passing xmachines actors
    for (const file of finalVerifiedFiles) {
        if (file.path.includes('src/') && !file.path.includes('.test.ts')) {
            const skillDir = '.skills/actors';
            if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
            const skillName = path.basename(file.path);
            fs.writeFileSync(path.join(skillDir, skillName), file.content);
            console.log(`⚡ Skill Extracted: ${skillName}`);
        }
    }
    
    console.log("🎯 Handoff Complete. Engine spinning down.");
}

function getGitValue(command: string, fallback: string) {
    try {
        return execSync(command, { stdio: "pipe" }).toString().trim() || fallback;
    } catch {
        return fallback;
    }
}

function isOperatorCommentEvent() {
    const eventName = process.env.GITHUB_EVENT_NAME;
    return eventName === "issue_comment" || eventName === "pull_request_review";
}

function markOperatorOnlyFromEnv() {
    const githubEnv = process.env.GITHUB_ENV;
    if (!githubEnv) return;

    fs.appendFileSync(githubEnv, "VIBE_OPERATOR_ONLY=1\n", "utf8");
}

async function publishCommentBodyFromEnv(body: string) {
    const target = resolveGitHubCommentTarget(process.env);
    if (!target.enabled) {
        console.log(`🧭 Operator comment skipped: ${target.reason}`);
        return;
    }

    try {
        const result = await publishCockpitComment({
            token: target.token,
            repository: target.repository,
            issueNumber: target.issueNumber,
            body,
        });
        console.log(`🧭 Operator comment ${result.status}: ${result.url ?? "no URL returned"}`);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("⚠️ Operator comment publish failed:", message);
    }
}

async function publishCockpitFromEnv(
    state: string,
    runState: {
        generatedFiles: Array<{ path: string; content: string }>;
        failures: Array<{ failureClass: "model_output"; symptom: string; output: string }>;
        attempts: number;
        maxAttempts: number;
    },
) {
    const target = resolveGitHubCommentTarget(process.env);
    if (!target.enabled) {
        console.log(`🧭 Cockpit comment skipped: ${target.reason}`);
        return;
    }

    const body = renderCockpitComment(state, {
        issueNumber: ISSUE_NUMBER,
        issueTitle: ISSUE_TITLE,
        issueBody: ISSUE_BODY,
        attempts: runState.attempts,
        maxAttempts: runState.maxAttempts,
        findings: [],
        generatedFiles: runState.generatedFiles,
        verificationResults: [],
        failures: runState.failures,
    });

    try {
        const result = await publishCockpitComment({
            token: target.token,
            repository: target.repository,
            issueNumber: target.issueNumber,
            body,
        });
        console.log(`🧭 Cockpit comment ${result.status}: ${result.url ?? "no URL returned"}`);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("⚠️ Cockpit comment publish failed:", message);
    }
}

runOS().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Fatal OS run failure:", message);
    process.exit(1);
});
