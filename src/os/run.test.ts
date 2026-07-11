import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runOSActor } from "./run.js";
import type { GeneratedFile } from "./events.js";

describe("vibe engine OS runtime", () => {
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
  });
  it("uses structured gate failure feedback in the ratchet loop", async () => {
    const result = await runOSActor(
      {
        issueNumber: "99",
        issueTitle: "Structured feedback smoke",
        issueBody: "src/feedback-smoke.ts",
      },
      buildStubDeps([
        {
          path: "src/auth/session.ts",
          content: "export const blocked = true;",
        },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.gateFailures.length).toBeGreaterThan(0);
    expect(result.gateFailures[0]).toMatchObject({
      status: "gate_failed",
      gate_id: expect.any(String),
      analysis: expect.objectContaining({
        path: expect.any(String),
        detail: expect.any(String),
      }),
      remediation_instruction: expect.any(String),
    });
    expect(result.feedbackMarkdown).toContain("### Gate failed:");
  });

  it("pauses high-risk plans until approval is granted", async () => {
    const result = await runOSActor(
      {
        issueNumber: "100",
        issueTitle: "Workflow edit",
        issueBody: ".github/workflows/forever.yml",
      },
      buildStubDeps([]),
    );

    expect(result.success).toBe(false);
    expect(result.state).toBe("awaiting_approval");
    expect(result.manifest?.approvalRequired).toBe(true);
  });

  it("runs validators before writing generated files to disk", async () => {
    let wroteToDisk = false;
    const deps = buildStubDeps([
      { path: "../escape.ts", content: "export {};" },
    ]);
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
      },
      deps,
    );

    expect(wroteToDisk).toBe(false);
  });
});

function buildStubDeps(files: GeneratedFile[]) {
  return {
    callOpenAI: async () => JSON.stringify({ files }),
    callGemini: async () => "PASS",
    getGitValue: (_command: string, fallback: string) => fallback,
    readConstitution: () => "constitution",
    readRepoContext: () => "repo",
    readEvoMem: () => "",
    writePlan: () => undefined,
    writeFilesToDisk: (generated: GeneratedFile[]) => {
      const backups = new Map<string, string | null>();
      for (const file of generated) {
        backups.set(file.path, null);
        fs.mkdirSync(path.dirname(file.path), { recursive: true });
        fs.writeFileSync(file.path, file.content);
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
