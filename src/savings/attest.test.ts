import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeRunManifest } from "../run/manifest.js";
import {
  buildAndWriteSavingsAttestation,
  buildSavingsAttestation,
  hashSavingsEntry,
  pickSavingsMetrics,
  verifySavingsChain,
} from "./attest.js";

const temps: string[] = [];

function tempRoot(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("pickSavingsMetrics", () => {
  it("infers gateHit from tokensEstimate=0 + firstPassGreen", () => {
    expect(
      pickSavingsMetrics({ tokensEstimate: 0, firstPassGreen: true }),
    ).toMatchObject({ gateHit: true, tokensEstimate: 0 });
  });

  it("preserves explicit gateHit / contextChars / tokensEstimate", () => {
    expect(
      pickSavingsMetrics({
        gateHit: false,
        contextChars: 1200,
        tokensEstimate: 400,
      }),
    ).toEqual({
      gateHit: false,
      contextChars: 1200,
      tokensEstimate: 400,
    });
  });

  it("preserves graphCacheHit / hops / gateAbsorbedLesson", () => {
    expect(
      pickSavingsMetrics({
        graphCacheHit: true,
        hops: 1,
        gateAbsorbedLesson: true,
        contextChars: 10,
      }),
    ).toMatchObject({
      graphCacheHit: true,
      hops: 1,
      gateAbsorbedLesson: true,
      contextChars: 10,
    });
  });
});

describe("savings attestation chain", () => {
  it("hash-chains run metrics and verifies", () => {
    const root = tempRoot("vibe-savings-attest-");
    writeRunManifest(root, {
      runId: "run_a",
      issueNumber: "1",
      issueTitle: "gate chore",
      branchName: "feat/a",
      baseSha: "abc",
      generatedFiles: [],
      createdAt: "2026-08-01T00:00:00.000Z",
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        gateIdsFailed: [],
        durationMs: 10,
        gateHit: true,
        contextChars: 100,
        tokensEstimate: 0,
      },
    });
    writeRunManifest(root, {
      runId: "run_b",
      issueNumber: "2",
      issueTitle: "codegen",
      branchName: "feat/b",
      baseSha: "def",
      generatedFiles: ["x.ts"],
      createdAt: "2026-08-02T00:00:00.000Z",
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        gateIdsFailed: [],
        durationMs: 20,
        gateHit: false,
        contextChars: 500,
        tokensEstimate: 200,
      },
    });

    const attestation = buildSavingsAttestation({
      rootDir: root,
      runIds: ["run_a", "run_b"],
      now: () => "2026-08-07T12:00:00.000Z",
    });

    expect(attestation.schema).toBe("coreward.savings_attestation.v1");
    expect(attestation.runCount).toBe(2);
    expect(attestation.summary.gateHits).toBe(1);
    expect(attestation.summary.totalContextChars).toBe(600);
    expect(attestation.summary.totalTokensEstimate).toBe(200);
    expect(attestation.summary.graphCacheHits).toBe(0);
    expect(attestation.chain[0].prevHash).toBeNull();
    expect(attestation.chain[1].prevHash).toBe(attestation.chain[0].entryHash);
    expect(attestation.tipHash).toBe(attestation.chain[1].entryHash);
    expect(verifySavingsChain(attestation.chain)).toBe(true);

    const h0 = hashSavingsEntry({
      prevHash: null,
      runId: "run_a",
      metrics: attestation.chain[0].metrics,
      createdAt: attestation.chain[0].createdAt,
    });
    expect(h0).toBe(attestation.chain[0].entryHash);
  });

  it("detects tampered chain", () => {
    const root = tempRoot("vibe-savings-tamper-");
    writeRunManifest(root, {
      runId: "run_t",
      issueNumber: "9",
      issueTitle: "t",
      branchName: "b",
      baseSha: "s",
      generatedFiles: [],
      createdAt: "2026-08-03T00:00:00.000Z",
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        gateIdsFailed: [],
        durationMs: 1,
        gateHit: true,
        tokensEstimate: 0,
      },
    });
    const att = buildSavingsAttestation({
      rootDir: root,
      runIds: ["run_t"],
    });
    const broken = structuredClone(att.chain);
    broken[0].metrics.tokensEstimate = 999;
    expect(verifySavingsChain(broken)).toBe(false);
  });

  it("writes attestation JSON under .vibe/", () => {
    const root = tempRoot("vibe-savings-write-");
    writeRunManifest(root, {
      runId: "run_w",
      issueNumber: "3",
      issueTitle: "w",
      branchName: "b",
      baseSha: "s",
      generatedFiles: [],
      createdAt: "2026-08-04T00:00:00.000Z",
      metrics: {
        attempts: 1,
        firstPassGreen: true,
        gateIdsFailed: [],
        durationMs: 5,
        contextChars: 42,
        tokensEstimate: 7,
      },
    });
    const { path: out, attestation } = buildAndWriteSavingsAttestation({
      rootDir: root,
      runIds: ["run_w"],
    });
    expect(out).toContain("savings-attestation.json");
    expect(fs.existsSync(out)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(out, "utf8")) as typeof attestation;
    expect(loaded.summary.totalContextChars).toBe(42);
    expect(verifySavingsChain(loaded.chain)).toBe(true);
  });
});
