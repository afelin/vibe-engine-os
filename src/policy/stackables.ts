import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type ActiveStack = {
  legalSpace: string;
  projectProfile?: string;
  activatedAt: string;
};

const LEGAL_SPACES_REL = "src/policy/stackables/legal-spaces";
const PROFILES_REL = "src/policy/profiles";
const ACTIVE_STACK_REL = ".vibe/active-stack.json";

const bundledLegalSpacesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "stackables/legal-spaces",
);

const bundledProfilesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "profiles",
);

function listJsonIds(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .filter((id) => id.length > 0);
}

/** Legal space ids. Always includes `none`. Scans packs when present; otherwise `none` only. */
export function listLegalSpaces(rootDir = "."): string[] {
  const ids = new Set<string>(["none"]);
  for (const dir of [
    path.join(rootDir, LEGAL_SPACES_REL),
    bundledLegalSpacesDir,
  ]) {
    for (const id of listJsonIds(dir)) ids.add(id);
  }
  return [...ids].sort();
}

/** Project profile ids from `src/policy/profiles` (e.g. tabdab when present). */
export function listProjectProfiles(rootDir = "."): string[] {
  const ids = new Set<string>();
  for (const dir of [path.join(rootDir, PROFILES_REL), bundledProfilesDir]) {
    for (const id of listJsonIds(dir)) ids.add(id);
  }
  return [...ids].sort();
}

export function listStackables(rootDir = "."): {
  legal_spaces: string[];
  project_profiles: string[];
} {
  return {
    legal_spaces: listLegalSpaces(rootDir),
    project_profiles: listProjectProfiles(rootDir),
  };
}

export function readActiveStack(rootDir = "."): ActiveStack | null {
  const filePath = path.join(rootDir, ACTIVE_STACK_REL);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
      string,
      unknown
    >;
    if (typeof raw.legalSpace !== "string" || !raw.legalSpace.trim()) {
      return null;
    }
    const stack: ActiveStack = {
      legalSpace: raw.legalSpace.trim(),
      activatedAt:
        typeof raw.activatedAt === "string" && raw.activatedAt
          ? raw.activatedAt
          : "",
    };
    if (typeof raw.projectProfile === "string" && raw.projectProfile.trim()) {
      stack.projectProfile = raw.projectProfile.trim();
    }
    return stack;
  } catch {
    return null;
  }
}

export function setLegalSpace(
  rootDir: string,
  legalSpace: string,
  projectProfile?: string,
): ActiveStack {
  const space = legalSpace.trim();
  const allowedSpaces = listLegalSpaces(rootDir);
  if (!allowedSpaces.includes(space)) {
    throw new Error(
      `Unknown legal space: ${space}. Allowed: ${allowedSpaces.join(", ")}`,
    );
  }

  let profile: string | undefined;
  if (projectProfile !== undefined && projectProfile.trim()) {
    profile = projectProfile.trim();
    const allowedProfiles = listProjectProfiles(rootDir);
    if (!allowedProfiles.includes(profile)) {
      throw new Error(
        `Unknown project profile: ${profile}. Allowed: ${allowedProfiles.join(", ") || "(none)"}`,
      );
    }
  }

  const stack: ActiveStack = {
    legalSpace: space,
    activatedAt: new Date().toISOString(),
    ...(profile ? { projectProfile: profile } : {}),
  };

  const vibeDir = path.join(rootDir, ".vibe");
  fs.mkdirSync(vibeDir, { recursive: true });
  fs.writeFileSync(
    path.join(vibeDir, "active-stack.json"),
    `${JSON.stringify(stack, null, 2)}\n`,
    "utf8",
  );
  return stack;
}
