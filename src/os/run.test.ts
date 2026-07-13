import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runOSActor } from "./run.js";
import type { GeneratedFile } from "./events.js";
import { createOSPlayer, getPersistedSnapshot } from "./player.js";
import { createInitialOSContext } from "./machine.js";
import { writeActorSnapshot } from "../run/manifest.js";

describe("vibe engine OS runtime", () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    process.env.VIBE_PLANNER_PROVIDER = "openai";
    process.env.VIBE_CODEGEN_PROVIDER = "openai";
    process.env.VIBE_CRITIC_PROVIDER = "off";
    process.env.VIBE_PLANNER_BASE_URL = "http://localhost";
    process.env.VIBE_PLANNER_API_KEY = "test";
    process.env.VIBE_PLANNER_MODEL = "test";
    process.env.VIBE_CODEGEN_BASE_URL = "http://localhost";
    process.env.VIBE_CODEGEN_API_KEY = "test";
    process.env.VIBE_CODEGEN_MODEL = "test";
    process.env.VIBE_DEPTH = "3";
  });

  afterEach(() => {
    delete process.env.VIBE_PLANNER_PROVIDER;
    delete process.env.VIBE_CODEGEN_PROVIDER;
    delete process.env.VIBE_CRITIC_PROVIDER;
    delete process.env.VIBE_PLANNER_BASE_URL;
    delete process.env.VIBE_PLANNER_API_KEY;
    delete process.env.VIBE_PLANNER_MODEL;
    delete process.env.VIBE_CODEGEN_BASE_URL;
    delete process.env.VIBE_CODEGEN_API_KEY;
    delete process.env.VIBE_CODEGEN_MODEL;
    delete process.env.VIBE_DEPTH;
    delete process.env.VIBE_RUN_ID;

    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("uses structured gate failure feedback in the ratchet loop", async () => {
    const root = makeRoot(tmpDirs);
    const result = await runOSActor(
      {
        issueNumber: "99",
        issueTitle: "Structured feedback smoke",
        issueBody: "src/feedback-smoke.ts",
        rootDir: root,
      },
      buildStubDeps(
        [
          {
            path: "src/auth/session.ts",
            content: "export const blocked = true;",
          },
        ],
        JSON.stringify({
          issueNumber: "99",
          title: "Structured feedback smoke",
          nodes: [
            {
              id: "edit-1",
              title: "Edit",
              kind: "edit",
              dependsOn: [],
              risk: "low",
              files: ["src/feedback-smoke.ts"],
              acceptance: ["tests pass"],
            },
          ],
        }),
        root,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.gateFailures.length).toBeGreaterThan(0);
    expect(result.manifest?.metrics?.attempts).toBeGreaterThan(0);
  });

  it("pauses high-risk plans until approval is granted", async () => {
    const root = makeRoot(tmpDirs);
    const result = await runOSActor(
      {
        issueNumber: "100",
        issueTitle: "CODEOWNERS edit",
        issueBody: `### Intent (one sentence)
Update CODEOWNERS for review routing

### Files to touch (exact paths)
.github/CODEOWNERS
`,
        rootDir: root,
      },
      buildStubDeps(
        [],
        JSON.stringify({
          issueNumber: "100",
          title: "CODEOWNERS edit",
          nodes: [
            {
              id: "edit-1",
              title: "Edit CODEOWNERS",
              kind: "edit",
              dependsOn: [],
              risk: "high",
              files: [".github/CODEOWNERS"],
              acceptance: ["tests pass"],
            },
          ],
        }),
        root,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.state).toBe("awaiting_approval");
    expect(result.manifest?.approvalRequired).toBe(true);
  });

  it("pauses package.json edits for mandate approval", async () => {
    const root = makeRoot(tmpDirs);
    const result = await runOSActor(
      {
        issueNumber: "102",
        issueTitle: "Dependency bump",
        issueBody: `### Intent (one sentence)
Bump dependency version

### Files to touch (exact paths)
package.json
`,
        rootDir: root,
      },
      buildStubDeps(
        [{ path: "package.json", content: "{}" }],
        JSON.stringify({
          issueNumber: "102",
          title: "Dependency bump",
          nodes: [
            {
              id: "edit-1",
              title: "Bump deps",
              kind: "edit",
              dependsOn: [],
              risk: "high",
              files: ["package.json"],
              acceptance: ["tests pass"],
            },
          ],
        }),
        root,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.state).toBe("awaiting_approval");
  });

  it("approve-after-pause resumes to promotion-ready completion", async () => {
    const root = makeRoot(tmpDirs);
    const deps = buildStubDeps(
      [{ path: ".github/CODEOWNERS", content: "* @team\n" }],
      JSON.stringify({
        issueNumber: "106",
        title: "CODEOWNERS resume",
        nodes: [
          {
            id: "edit-1",
            title: "Edit CODEOWNERS",
            kind: "edit",
            dependsOn: [],
            risk: "high",
            files: [".github/CODEOWNERS"],
            acceptance: ["tests pass"],
          },
        ],
      }),
      root,
    );

    const paused = await runOSActor(
      {
        issueNumber: "106",
        issueTitle: "CODEOWNERS resume",
        issueBody: `### Intent (one sentence)
Update CODEOWNERS

### Files to touch (exact paths)
.github/CODEOWNERS
`,
        rootDir: root,
      },
      deps,
    );

    expect(paused.state).toBe("awaiting_approval");
    expect(paused.manifest?.runId).toBeTruthy();

    const resumed = await runOSActor(
      {
        issueNumber: "106",
        issueTitle: "CODEOWNERS resume",
        issueBody: `### Intent (one sentence)
Update CODEOWNERS

### Files to touch (exact paths)
.github/CODEOWNERS
`,
        rootDir: root,
        approvedBy: "operator",
      },
      deps,
    );

    expect(resumed.success).toBe(true);
    expect(resumed.generatedFiles.map((file) => file.path)).toContain(
      ".github/CODEOWNERS",
    );
    expect(
      fs.readFileSync(
        path.join(root, ".runs", "index", "issue-106.json"),
        "utf8",
      ),
    ).toContain("completed");
  });

  it("depth 1 writes plan only without codegen", async () => {
    process.env.VIBE_DEPTH = "1";
    const root = makeRoot(tmpDirs);
    let planned = false;

    const result = await runOSActor(
      {
        issueNumber: "103",
        issueTitle: "Plan only",
        issueBody: "src/plan-only.ts",
        rootDir: root,
      },
      {
        ...buildStubDeps([{ path: "src/plan-only.ts", content: "export {};" }], undefined, root),
        writePlan: () => {
          planned = true;
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("planning");
    expect(planned).toBe(true);
    expect(result.generatedFiles).toHaveLength(0);
  });

  it("rejects invalid planner DAG before codegen", async () => {
    const root = makeRoot(tmpDirs);
    let calls = 0;
    const deps = buildStubDeps(
      [{ path: "src/invalid-dag.ts", content: "export {};" }],
      JSON.stringify({
        issueNumber: "104",
        title: "Invalid DAG",
        nodes: [
          {
            id: "a",
            title: "A",
            kind: "edit",
            dependsOn: ["b"],
            risk: "low",
            files: ["src/invalid-dag.ts"],
            acceptance: ["tests pass"],
          },
          {
            id: "b",
            title: "B",
            kind: "edit",
            dependsOn: ["a"],
            risk: "low",
            files: ["src/invalid-dag.ts"],
            acceptance: ["tests pass"],
          },
        ],
      }),
      root,
    );
    const originalCall = deps.callOpenAI;
    deps.callOpenAI = async (...args) => {
      calls++;
      return originalCall(...args);
    };

    const result = await runOSActor(
      {
        issueNumber: "104",
        issueTitle: "Invalid DAG",
        issueBody: "src/invalid-dag.ts",
        rootDir: root,
      },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.feedbackMarkdown).toContain("Invalid execution DAG");
    expect(calls).toBe(1);
  });

  it("resumes past planning and skips planner when snapshot is at generating_patch", async () => {
    const root = makeRoot(tmpDirs);
    const runId = "resume-run-105";
    process.env.VIBE_RUN_ID = runId;

    const context = {
      ...createInitialOSContext(),
      issueNumber: "105",
      issueTitle: "Resume test",
      issueBody: "src/resume-smoke.ts",
      vibeDepth: 3 as const,
    };

    const actor = createOSPlayer(context);
    actor.send({ type: "preflight.completed", findings: [] });
    actor.send({
      type: "plan.created",
      dag: {
        issueNumber: "105",
        title: "Resume test",
        nodes: [
          {
            id: "edit-1",
            title: "Edit",
            kind: "edit" as const,
            dependsOn: [],
            risk: "low" as const,
            files: ["src/resume-smoke.ts"],
            acceptance: ["tests pass"],
          },
        ],
      },
    });
    actor.send({ type: "risk.reviewed", risk: "low", reason: "safe" });
    writeActorSnapshot(root, runId, getPersistedSnapshot(actor));

    let llmCalls = 0;
    let plannerCalls = 0;
    const deps = buildStubDeps(
      [{ path: "src/resume-smoke.ts", content: "export const ok = true;\n" }],
      undefined,
      root,
    );
    const originalCall = deps.callOpenAI;
    deps.callOpenAI = async (...args) => {
      llmCalls++;
      const user = args[4];
      if (typeof user === "string" && user.includes("execution blueprint")) {
        plannerCalls++;
      }
      if (typeof user === "string" && user.includes("Execute this plan")) {
        return JSON.stringify({
          files: [{ path: "src/resume-smoke.ts", content: "export const ok = true;\n" }],
        });
      }
      return originalCall(...args);
    };

    const result = await runOSActor(
      {
        issueNumber: "105",
        issueTitle: "Resume test",
        issueBody: "src/resume-smoke.ts",
        rootDir: root,
      },
      deps,
    );

    expect(result.success).toBe(true);
    expect(plannerCalls).toBe(0);
    expect(llmCalls).toBeGreaterThanOrEqual(1);
    expect(result.manifest?.vowsHash).toBeTruthy();
    expect(result.manifest?.capsuleHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses zero-token release gate without calling the planner LLM", async () => {
    const root = makeRoot(tmpDirs);
    let llmCalls = 0;
    const deps = buildStubDeps([], undefined, root);
    const originalCall = deps.callOpenAI;
    deps.callOpenAI = async (...args) => {
      llmCalls++;
      return originalCall(...args);
    };

    const result = await runOSActor(
      {
        issueNumber: "3",
        issueTitle: "cloud loop",
        issueBody: "src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts",
        rootDir: root,
      },
      deps,
    );

    expect(result.success).toBe(true);
    expect(llmCalls).toBe(0);
    expect(result.generatedFiles.map((file) => file.path)).toEqual([
      "src/cloud-loop-smoke.ts",
      "src/cloud-loop-smoke.test.ts",
    ]);
    expect(result.manifest?.bondHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      fs.existsSync(path.join(root, ".runs/bonds/issue-3.bond.json")),
    ).toBe(true);
  });

  it("runs validators before writing generated files to disk", async () => {
    let wroteToDisk = false;
    const root = makeRoot(tmpDirs);
    const deps = buildStubDeps(
      [{ path: "../escape.ts", content: "export {};" }],
      JSON.stringify({
        issueNumber: "101",
        title: "Validate before write",
        nodes: [
          {
            id: "edit-1",
            title: "Edit",
            kind: "edit",
            dependsOn: [],
            risk: "low",
            files: ["src/safe.ts"],
            acceptance: ["tests pass"],
          },
        ],
      }),
      root,
    );
    const originalWrite = deps.writeFilesToDisk;
    deps.writeFilesToDisk = (files) => {
      wroteToDisk = true;
      return originalWrite(files);
    };

    await runOSActor(
      {
        issueNumber: "101",
        issueTitle: "Validate before write",
        issueBody: "src/safe.ts",
        rootDir: root,
      },
      deps,
    );

    expect(wroteToDisk).toBe(false);
  });
});

function makeRoot(tmpDirs: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-run-os-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, ".runs"), { recursive: true });
  return root;
}

function buildStubDeps(
  files: GeneratedFile[],
  plannerJson?: string,
  root = ".",
) {
  let llmCalls = 0;
  return {
    callOpenAI: async (
      _baseUrl: string,
      _apiKey: string,
      _model: string,
      _system: string,
      _user: string,
    ) => {
      llmCalls++;
      if (llmCalls === 1) {
        return (
          plannerJson ??
          JSON.stringify({
            issueNumber: "0",
            title: "Fallback",
            nodes: [
              {
                id: "edit-1",
                title: "Edit",
                kind: "edit",
                dependsOn: [],
                risk: "low",
                files: files.map((file) => file.path),
                acceptance: ["tests pass"],
              },
            ],
          })
        );
      }
      return JSON.stringify({ files });
    },
    callGemini: async () => "PASS",
    getGitValue: (_command: string, fallback: string) => fallback,
    readConstitution: () => "constitution",
    readRepoContext: () => "repo",
    readEvoMem: () => "",
    writePlan: () => undefined,
    writeFilesToDisk: (generated: GeneratedFile[]) => {
      const backups = new Map<string, string | null>();
      for (const file of generated) {
        const filepath = path.join(root, file.path);
        backups.set(filepath, null);
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
        fs.writeFileSync(filepath, file.content);
      }
      return backups;
    },
    restoreBackups: (backups: Map<string, string | null>) => {
      for (const [filepath] of backups.entries()) {
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      }
    },
    runTsc: () => undefined,
    runVitest: () => undefined,
    appendEvoMem: () => undefined,
    writeCriticFailed: () => undefined,
  };
}
