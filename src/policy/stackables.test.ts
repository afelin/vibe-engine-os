import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateMandates, loadMandates } from "./evaluate.js";
import {
  applyStackableDeltas,
  listLegalSpaceIds,
  listLegalSpaces,
  listProjectProfiles,
  listStackables,
  loadActiveStack,
  loadEffectiveMandates,
  loadLegalSpacePack,
  readActiveStack,
  setLegalSpace,
} from "./stackables.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("stackables", () => {
  it("discovers none, eu-nis2-cra, and us-baseline from disk packs", () => {
    const ids = listLegalSpaceIds(".");
    expect(ids).toEqual(["eu-nis2-cra", "none", "us-baseline"]);
    expect(listLegalSpaces(".")).toEqual(ids);
  });

  it("includes tabdab when profiles exist in repo", () => {
    expect(listProjectProfiles(".")).toContain("tabdab");
  });

  it("listStackables returns legal_spaces and project_profiles", () => {
    const listed = listStackables(".");
    expect(listed.legal_spaces).toEqual(["eu-nis2-cra", "none", "us-baseline"]);
    expect(listed.project_profiles).toContain("tabdab");
  });

  it("setLegalSpace writes active-stack.json and rejects unknown ids", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-stack-"));
    tempDirs.push(root);

    expect(() => setLegalSpace(root, "not-a-real-space")).toThrow(
      /Unknown legal space/,
    );
    expect(() => setLegalSpace(root, "none", "nope")).toThrow(
      /Unknown project profile/,
    );

    const stack = setLegalSpace(root, "none");
    expect(stack.legalSpace).toBe("none");
    expect(stack.activatedAt).toMatch(/^\d{4}-/);
    expect(readActiveStack(root)).toMatchObject({ legalSpace: "none" });
    expect(loadActiveStack(root)).toMatchObject({ legalSpace: "none" });

    const raw = JSON.parse(
      fs.readFileSync(path.join(root, ".vibe/active-stack.json"), "utf8"),
    );
    expect(raw.legalSpace).toBe("none");
    expect(raw.projectProfile).toBeUndefined();
  });

  it("setLegalSpace accepts known project profile when profile file exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-stack-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "src/policy/profiles"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src/policy/profiles/tabdab.json"),
      JSON.stringify({
        name: "tabdab",
        description: "test",
        allowed_file_prefixes: [],
        suggested_bound_prefixes: [],
      }),
      "utf8",
    );

    const stack = setLegalSpace(root, "none", "tabdab");
    expect(stack).toMatchObject({
      legalSpace: "none",
      projectProfile: "tabdab",
    });
  });

  it("setLegalSpace accepts eu-nis2-cra from bundled packs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-stack-"));
    tempDirs.push(root);
    expect(() => setLegalSpace(root, "eu-nis2-cra")).not.toThrow();
    expect(loadActiveStack(root)?.legalSpace).toBe("eu-nis2-cra");
  });

  it("loadLegalSpacePack fails closed on unknown ids", () => {
    expect(() => loadLegalSpacePack("not-a-space", ".")).toThrow(
      /Unknown legal space/,
    );
  });

  it("eu-nis2-cra forbids and extra-approves paths that none allows", () => {
    const base = loadMandates(".");
    const nonePack = loadLegalSpacePack("none", ".");
    const euPack = loadLegalSpacePack("eu-nis2-cra", ".");

    const noneMandates = applyStackableDeltas(base, nonePack);
    const euMandates = applyStackableDeltas(base, euPack);

    const cryptoPath = "src/crypto/keys.ts";
    const policyPath = "src/policy/mandates.json";

    const noneCrypto = evaluateMandates([cryptoPath], noneMandates);
    expect(noneCrypto.passed).toBe(true);
    expect(noneCrypto.requiresApproval).toBe(false);

    const euCrypto = evaluateMandates([cryptoPath], euMandates);
    expect(euCrypto.passed).toBe(false);
    expect(euCrypto.violations.some((v) => v.rule === "forbidden")).toBe(true);

    const nonePolicy = evaluateMandates([policyPath], noneMandates);
    expect(nonePolicy.requiresApproval).toBe(false);

    const euPolicy = evaluateMandates([policyPath], euMandates);
    expect(euPolicy.requiresApproval).toBe(true);
    expect(euMandates.max_attempts).toBe(2);
    expect(noneMandates.max_attempts).toBe(base.max_attempts);
  });

  it("loadEffectiveMandates applies active stack and fails closed on unknown", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-stack-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "src/policy"), { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), "src/policy/mandates.json"),
      path.join(root, "src/policy/mandates.json"),
    );

    expect(loadEffectiveMandates(root).forbidden_prefixes).toEqual(
      loadMandates(root).forbidden_prefixes,
    );

    setLegalSpace(root, "eu-nis2-cra");
    const effective = loadEffectiveMandates(root);
    expect(effective.forbidden_prefixes).toContain("src/crypto/");
    expect(evaluateMandates(["src/crypto/x.ts"], effective).passed).toBe(false);

    fs.writeFileSync(
      path.join(root, ".vibe/active-stack.json"),
      JSON.stringify({
        legalSpace: "bogus-regime",
        activatedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    expect(() => loadEffectiveMandates(root)).toThrow(/Unknown legal space/);
  });
});
