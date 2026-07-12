import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runOSActor } from "./run.js";
import { replayRun } from "./replay.js";
import type { GeneratedFile } from "./events.js";

describe("time-travel replay gate", () => {
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

    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("round-trips a run: replayed snapshot hash matches the stored snapshot", async () => {
    const root = makeRoot(tmpDirs);
    const result = await runSmokeActor(root, "301");

    expect(result.success).toBe(true);
    const runId = result.manifest!.runId;
    expect(fs.existsSync(path.join(root, ".runs", runId, "events.ndjson"))).toBe(
      true,
    );

    const verdict = replayRun(root, runId);
    expect(verdict.ok).toBe(true);
    expect(verdict.replayedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verdict.replayedHash).toBe(verdict.storedHash);
  });

  it("detects a tampered event ledger", async () => {
    const root = makeRoot(tmpDirs);
    const result = await runSmokeActor(root, "302");
    expect(result.success).toBe(true);
    const runId = result.manifest!.runId;

    const ledgerPath = path.join(root, ".runs", runId, "events.ndjson");
    const tampered = fs
      .readFileSync(ledgerPath, "utf8")
      .replace("export const ok = true;", "export const ok = false;");
    expect(tampered).not.toBe(fs.readFileSync(ledgerPath, "utf8"));
    fs.writeFileSync(ledgerPath, tampered, "utf8");

    const verdict = replayRun(root, runId);
    expect(verdict.ok).toBe(false);
    expect(verdict.replayedHash).not.toBe(verdict.storedHash);
    expect(verdict.reason).toContain("does not match");
  });

  it("reports legacy runs without an event ledger", () => {
    const root = makeRoot(tmpDirs);
    fs.mkdirSync(path.join(root, ".runs", "legacy-run"), { recursive: true });

    const verdict = replayRun(root, "legacy-run");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("events.ndjson not found");
  });

  it("rejects invalid run ids without touching the filesystem", () => {
    const root = makeRoot(tmpDirs);
    const verdict = replayRun(root, "../escape");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("Invalid runId");
  });
});

function makeRoot(tmpDirs: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-replay-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, ".runs"), { recursive: true });
  return root;
}

async function runSmokeActor(root: string, issueNumber: string) {
  const files: GeneratedFile[] = [
    { path: "src/replay-smoke.ts", content: "export const ok = true;\n" },
  ];
  const plannerJson = JSON.stringify({
    issueNumber,
    title: "Replay smoke",
    nodes: [
      {
        id: "edit-1",
        title: "Edit",
        kind: "edit",
        dependsOn: [],
        risk: "low",
        files: ["src/replay-smoke.ts"],
        acceptance: ["tests pass"],
      },
    ],
  });

  return runOSActor(
    {
      issueNumber,
      issueTitle: "Replay smoke",
      issueBody: "src/replay-smoke.ts",
      rootDir: root,
    },
    buildStubDeps(files, plannerJson, root),
  );
}

function buildStubDeps(
  files: GeneratedFile[],
  plannerJson: string,
  root: string,
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
      if (llmCalls === 1) return plannerJson;
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
