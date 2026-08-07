import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUILTIN_CI_OVERRIDE_AGENT_ID,
  BUILTIN_CI_OVERRIDE_PROFILE,
  entryHasProfileFields,
  getDefaultProfile,
  intersectPathConstraints,
  isWardStrict,
  loadPrincipals,
  profileHash,
  resolveProfile,
} from "./index.js";

const temps: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-id-"));
  temps.push(root);
  fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
  return root;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent-id primitive", () => {
  it("loadPrincipals returns empty when missing", () => {
    const root = makeRoot();
    expect(loadPrincipals(root)).toEqual({ principals: [] });
  });

  it("resolveProfile returns null for trust-only principal (legacy)", () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [{ id: "issuer", public_key: "abc" }],
      }),
    );
    expect(resolveProfile(root, "issuer")).toBeNull();
    expect(entryHasProfileFields({ id: "issuer", public_key: "abc" })).toBe(
      false,
    );
  });

  it("resolveProfile maps profile fields; getDefaultProfile picks default", () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [
          {
            id: "cursor-bot",
            public_key: "pk1",
            default: true,
            default_path_constraints: ["src/"],
            max_bound_files: 8,
            max_context_chars: 8000,
            max_depth: 2,
          },
          { id: "other", public_key: "pk2" },
        ],
      }),
    );
    const profile = resolveProfile(root, "cursor-bot");
    expect(profile).toMatchObject({
      agent_id: "cursor-bot",
      default: true,
      default_path_constraints: ["src/"],
      max_bound_files: 8,
      max_context_chars: 8000,
      max_depth: 2,
    });
    expect(resolveProfile(root, "other")).toBeNull();
    expect(getDefaultProfile(root)?.agent_id).toBe("cursor-bot");
  });

  it("builtin CI override always resolves without principals", () => {
    const root = makeRoot();
    expect(resolveProfile(root, BUILTIN_CI_OVERRIDE_AGENT_ID)).toEqual(
      BUILTIN_CI_OVERRIDE_PROFILE,
    );
  });

  it("profileHash is stable for same profile", () => {
    const a = profileHash({
      agent_id: "x",
      default_path_constraints: ["src/"],
      max_depth: 1,
    });
    const b = profileHash({
      agent_id: "x",
      default_path_constraints: ["src/"],
      max_depth: 1,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("intersectPathConstraints tightens to more specific prefix", () => {
    expect(
      intersectPathConstraints(["src/", "tests/"], ["src/ward/"]),
    ).toEqual(["src/ward/"]);
    expect(intersectPathConstraints(["src/"], ["docs/"])).toEqual([]);
    expect(intersectPathConstraints(["src/"], [])).toEqual(["src/"]);
  });

  it("isWardStrict reads VIBE_WARD_STRICT", () => {
    expect(isWardStrict({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isWardStrict({ VIBE_WARD_STRICT: "1" } as NodeJS.ProcessEnv)).toBe(
      true,
    );
    expect(
      isWardStrict({ VIBE_WARD_STRICT: "true" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("actor string without profile still resolves as null (compat)", () => {
    const root = makeRoot();
    expect(resolveProfile(root, "random-github-user")).toBeNull();
  });
});
