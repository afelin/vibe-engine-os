import { describe, expect, it } from "vitest";
import {
  buildProofHpurl,
  generateProofSigningKeyPair,
  parseProofHpurl,
  signProofHpurl,
  verifyProofHpurl,
} from "./hpurl.js";

const BASE = "https://example.com/proof";
const PARAMS = {
  runId: "run-abc-123",
  capsuleHash: "a".repeat(64),
  vowsHash: "b".repeat(64),
  repo: "owner/repo",
};

describe("hpurl proof links", () => {
  it("builds hash-fragment URLs with required params", () => {
    const url = buildProofHpurl(BASE, PARAMS);
    expect(url).toBe(
      `${BASE}#?run=${PARAMS.runId}&capsule=${PARAMS.capsuleHash}&vows=${PARAMS.vowsHash}&repo=${encodeURIComponent(PARAMS.repo!)}`,
    );
    expect(url.indexOf("?")).toBe(url.indexOf("#?") + 1);
    expect(url).toContain("#?");
  });

  it("round-trips build and parse", () => {
    const url = buildProofHpurl(BASE, PARAMS);
    const parsed = parseProofHpurl(url);
    expect(parsed).toEqual({
      runId: PARAMS.runId,
      capsuleHash: PARAMS.capsuleHash,
      vowsHash: PARAMS.vowsHash,
      repo: PARAMS.repo,
      api: undefined,
      space: undefined,
      agent: undefined,
      signature: undefined,
      publicKey: undefined,
      scope: undefined,
    });
  });

  it("round-trips space= legal-space param", () => {
    const url = buildProofHpurl(BASE, {
      ...PARAMS,
      space: "eu-nis2-cra",
    });
    expect(url).toContain("space=eu-nis2-cra");
    const parsed = parseProofHpurl(url);
    expect(parsed?.space).toBe("eu-nis2-cra");
  });

  it("round-trips agent= AgentId param", () => {
    const url = buildProofHpurl(BASE, {
      ...PARAMS,
      agent: "cursor-bot",
    });
    expect(url).toContain("agent=cursor-bot");
    const parsed = parseProofHpurl(url);
    expect(parsed?.agent).toBe("cursor-bot");
  });

  it("omits optional repo when not provided", () => {
    const { repo: _repo, ...required } = PARAMS;
    const url = buildProofHpurl(BASE, required);
    const parsed = parseProofHpurl(url);
    expect(parsed?.repo).toBeUndefined();
    expect(parsed?.runId).toBe(required.runId);
  });

  it("parses reserved signature and pubkey params", () => {
    const url = `${BASE}#?run=x&capsule=y&vows=z&%24=sig&%40=pubkey&%21=scope1`;
    const parsed = parseProofHpurl(url);
    expect(parsed).toMatchObject({
      runId: "x",
      capsuleHash: "y",
      vowsHash: "z",
      signature: "sig",
      publicKey: "pubkey",
      scope: "scope1",
    });
  });

  it("returns null for missing required params", () => {
    expect(parseProofHpurl(`${BASE}#?run=only`)).toBeNull();
    expect(parseProofHpurl(`${BASE}?run=query-not-hash`)).toBeNull();
    expect(parseProofHpurl("not-a-url")).toBeNull();
  });

  it("handles trailing slash on base URL", () => {
    const url = buildProofHpurl(`${BASE}/`, PARAMS);
    expect(url.startsWith(`${BASE}#?`)).toBe(true);
  });

  it("includes api param when set", () => {
    const url = buildProofHpurl(BASE, {
      ...PARAMS,
      api: "https://verify.example/verify-capsule",
    });
    const parsed = parseProofHpurl(url);
    expect(parsed?.api).toBe("https://verify.example/verify-capsule");
  });

  it("signs and verifies Ed25519 proof URLs (v1.1)", async () => {
    const keyPair = await generateProofSigningKeyPair();
    const signed = await signProofHpurl(BASE, PARAMS, keyPair);
    expect(parseProofHpurl(signed)?.signature).toBeTruthy();
    expect(parseProofHpurl(signed)?.publicKey).toBeTruthy();
    await expect(verifyProofHpurl(signed)).resolves.toBe(true);
  });

  it("rejects tampered signed URLs", async () => {
    const keyPair = await generateProofSigningKeyPair();
    const signed = await signProofHpurl(BASE, PARAMS, keyPair);
    const tampered = signed.replace(PARAMS.capsuleHash, "c".repeat(64));
    await expect(verifyProofHpurl(tampered)).resolves.toBe(false);
  });

  it("throws when verifying unsigned URL", async () => {
    const unsigned = buildProofHpurl(BASE, PARAMS);
    await expect(verifyProofHpurl(unsigned)).rejects.toThrow(/v1\.1/);
  });
});
