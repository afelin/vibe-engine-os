import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type ProjectProfile = {
  name: string;
  description: string;
  allowed_file_prefixes: string[];
  suggested_bound_prefixes: string[];
};

const bundledProfilesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../policy/profiles",
);

export function loadProjectProfile(
  profileName?: string,
  rootDir = ".",
): ProjectProfile | null {
  const name = profileName?.trim() || process.env.VIBE_PROJECT_PROFILE?.trim();
  if (!name) return null;

  const candidates = [
    path.join(rootDir, "src/policy/profiles", `${name}.json`),
    path.join(bundledProfilesDir, `${name}.json`),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as ProjectProfile;
    } catch {
      return null;
    }
  }

  return null;
}

export function mergeAllowedPrefixes(
  base: string[],
  profile: ProjectProfile | null,
): string[] {
  if (!profile) return base;
  return [...new Set([...base, ...profile.allowed_file_prefixes])];
}
