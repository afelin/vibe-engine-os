import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMandates,
  type Mandates,
} from "./evaluate.js";

export type ActiveStack = {
  legalSpace: string;
  projectProfile?: string;
  activatedAt: string;
};

export type MandateDeltas = {
  forbidden_prefixes_extra?: string[];
  require_approval_prefixes_extra?: string[];
  max_attempts?: number;
};

export type LegalSpacePack = {
  id: string;
  title: string;
  description: string;
  mandate_deltas: MandateDeltas;
  gate_hints?: string[];
  narrative_tags?: string[];
  cyberready_align?: {
    regimes: string[];
    note: string;
  };
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

/** Legal space ids. Always includes `none`. Scans packs when present. */
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

/** Alias — pack discovery surface for agents/MCP. */
export function listLegalSpaceIds(rootDir = "."): string[] {
  return listLegalSpaces(rootDir);
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

/** Alias — reads `.vibe/active-stack.json`. */
export function loadActiveStack(rootDir = "."): ActiveStack | null {
  return readActiveStack(rootDir);
}

function resolvePackPath(id: string, rootDir: string): string | null {
  const candidates = [
    path.join(rootDir, LEGAL_SPACES_REL, `${id}.json`),
    path.join(bundledLegalSpacesDir, `${id}.json`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Load a legal-space pack by id. Unknown ids fail closed.
 */
export function loadLegalSpacePack(
  id: string,
  rootDir = ".",
): LegalSpacePack {
  const space = id.trim();
  if (!space) {
    throw new Error("Unknown legal space: (empty). Allowed: " + listLegalSpaceIds(rootDir).join(", "));
  }

  const allowed = listLegalSpaceIds(rootDir);
  if (!allowed.includes(space)) {
    throw new Error(
      `Unknown legal space: ${space}. Allowed: ${allowed.join(", ")}`,
    );
  }

  const packPath = resolvePackPath(space, rootDir);
  if (!packPath) {
    // `none` is always allowed even if pack file is missing (identity overlay).
    if (space === "none") {
      return {
        id: "none",
        title: "No legal-space overlay",
        description: "Default — vibe mandates only.",
        mandate_deltas: {},
      };
    }
    throw new Error(
      `Unknown legal space: ${space}. Pack file missing. Allowed: ${allowed.join(", ")}`,
    );
  }

  try {
    const raw = JSON.parse(fs.readFileSync(packPath, "utf8")) as LegalSpacePack;
    if (!raw || typeof raw.id !== "string" || raw.id !== space) {
      throw new Error(`Pack id mismatch for ${space}`);
    }
    return {
      id: raw.id,
      title: typeof raw.title === "string" ? raw.title : space,
      description:
        typeof raw.description === "string" ? raw.description : "",
      mandate_deltas:
        raw.mandate_deltas && typeof raw.mandate_deltas === "object"
          ? raw.mandate_deltas
          : {},
      ...(Array.isArray(raw.gate_hints) ? { gate_hints: raw.gate_hints } : {}),
      ...(Array.isArray(raw.narrative_tags)
        ? { narrative_tags: raw.narrative_tags }
        : {}),
      ...(raw.cyberready_align && typeof raw.cyberready_align === "object"
        ? { cyberready_align: raw.cyberready_align }
        : {}),
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Unknown legal space")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Pack id mismatch")) {
      throw error;
    }
    throw new Error(
      `Unknown legal space: ${space}. Failed to parse pack. Allowed: ${allowed.join(", ")}`,
    );
  }
}

/** Pure merge — deltas onto base mandates; never writes policy files. */
export function applyStackableDeltas(
  baseMandates: Mandates,
  pack: LegalSpacePack,
): Mandates {
  const deltas = pack.mandate_deltas ?? {};
  const forbidden = [
    ...baseMandates.forbidden_prefixes,
    ...(deltas.forbidden_prefixes_extra ?? []),
  ];
  const requireApproval = [
    ...baseMandates.require_approval_prefixes,
    ...(deltas.require_approval_prefixes_extra ?? []),
  ];

  return {
    ...baseMandates,
    forbidden_prefixes: [...new Set(forbidden)],
    require_approval_prefixes: [...new Set(requireApproval)],
    max_attempts:
      typeof deltas.max_attempts === "number" && deltas.max_attempts > 0
        ? deltas.max_attempts
        : baseMandates.max_attempts,
  };
}

/**
 * Base mandates + active legal-space pack. Unset stack → `none`.
 * Unknown active space fails closed (throws).
 */
export function loadEffectiveMandates(rootDir = "."): Mandates {
  const base = loadMandates(rootDir);
  const stack = loadActiveStack(rootDir);
  const spaceId = stack?.legalSpace?.trim() || "none";
  const pack = loadLegalSpacePack(spaceId, rootDir);
  return applyStackableDeltas(base, pack);
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

  // Fail closed: pack must load (except synthetic none without file — still ok via loadLegalSpacePack).
  loadLegalSpacePack(space, rootDir);

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
