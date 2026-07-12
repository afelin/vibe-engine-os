import { describe, expect, it } from "vitest";
import {
  computeVowsHash,
  createVowAttestation,
  loadVows,
} from "./vows.js";

describe("vows", () => {
  it("loads structured vows document", () => {
    const doc = loadVows(".");
    expect(doc.version).toBe("1.0.0");
    expect(doc.vows.length).toBeGreaterThanOrEqual(10);
  });

  it("computes stable vows hash", () => {
    const hash1 = computeVowsHash(".");
    const hash2 = computeVowsHash(".");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates vow attestation", () => {
    const attestation = createVowAttestation(".");
    expect(attestation.vowsVersion).toBe("1.0.0");
    expect(attestation.vowsHash).toBe(computeVowsHash("."));
    expect(attestation.attestedAt).toMatch(/^\d{4}-/);
  });
});
