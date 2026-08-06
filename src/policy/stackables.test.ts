import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listLegalSpaces,
  listProjectProfiles,
  listStackables,
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
  it("lists none when legal-spaces packs dir is absent", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-stack-"));
    tempDirs.push(root);
    expect(listLegalSpaces(root)).toEqual(["none"]);
  });

  it("includes tabdab when profiles exist in repo", () => {
    expect(listProjectProfiles(".")).toContain("tabdab");
  });

  it("listStackables returns legal_spaces and project_profiles", () => {
    const listed = listStackables(".");
    expect(listed.legal_spaces).toContain("none");
    expect(listed.project_profiles).toContain("tabdab");
  });

  it("setLegalSpace writes active-stack.json and rejects unknown ids", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-stack-"));
    tempDirs.push(root);

    expect(() => setLegalSpace(root, "eu-nis2-cra")).toThrow(/Unknown legal space/);
    expect(() => setLegalSpace(root, "none", "nope")).toThrow(
      /Unknown project profile/,
    );

    const stack = setLegalSpace(root, "none");
    expect(stack.legalSpace).toBe("none");
    expect(stack.activatedAt).toMatch(/^\d{4}-/);
    expect(readActiveStack(root)).toMatchObject({ legalSpace: "none" });

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

  it("scans legal-space pack ids when directory exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-stack-"));
    tempDirs.push(root);
    const packDir = path.join(root, "src/policy/stackables/legal-spaces");
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(
      path.join(packDir, "eu-nis2-cra.json"),
      JSON.stringify({ id: "eu-nis2-cra" }),
      "utf8",
    );
    expect(listLegalSpaces(root)).toEqual(["eu-nis2-cra", "none"]);
    expect(() => setLegalSpace(root, "eu-nis2-cra")).not.toThrow();
  });
});
