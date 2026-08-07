/**
 * AgentId — portable identity primitive (no Ward import).
 * Principals file is the one store; profile fields extend entries.
 * Absent profile fields ⇒ consumers stay legacy (no tighten / no stamp).
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalize } from "../constitution/capsule.js";

/** CI-signed /approve override actor — Option B; never human-attributed. */
export const BUILTIN_CI_OVERRIDE_AGENT_ID = "github-ci-bot-override";

export type AgentProfile = {
  agent_id: string;
  default?: boolean;
  /** Trust / future actor-sign; optional for efficiency-only profiles. */
  public_key?: string;
  default_path_constraints?: string[];
  max_bound_files?: number;
  max_context_chars?: number;
  max_depth?: number;
};

/** Principals trust entry; optional profile fields colocated (one list). */
export type PrincipalEntry = {
  id: string;
  public_key: string;
  default?: boolean;
  default_path_constraints?: string[];
  max_bound_files?: number;
  max_context_chars?: number;
  max_depth?: number;
};

export type PrincipalsFile = {
  principals: PrincipalEntry[];
};

export const BUILTIN_CI_OVERRIDE_PROFILE: AgentProfile = {
  agent_id: BUILTIN_CI_OVERRIDE_AGENT_ID,
};

const PRINCIPALS_VIBE_REL = path.join(".vibe", "principals.json");
const PRINCIPALS_POLICY_REL = path.join("src", "policy", "principals.json");

export function loadPrincipals(rootDir = "."): PrincipalsFile {
  const vibe = path.join(rootDir, PRINCIPALS_VIBE_REL);
  const policy = path.join(rootDir, PRINCIPALS_POLICY_REL);
  const source = fs.existsSync(vibe)
    ? vibe
    : fs.existsSync(policy)
      ? policy
      : null;
  if (!source) return { principals: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(source, "utf8")) as PrincipalsFile;
    const principals = Array.isArray(raw.principals) ? raw.principals : [];
    return {
      principals: principals.filter(
        (entry): entry is PrincipalEntry =>
          Boolean(
            entry &&
              typeof entry.id === "string" &&
              entry.id.length > 0 &&
              typeof entry.public_key === "string" &&
              entry.public_key.length > 0,
          ),
      ),
    };
  } catch {
    return { principals: [] };
  }
}

export function isTrustedPublicKey(
  publicKey: string,
  rootDir = ".",
): boolean {
  const { principals } = loadPrincipals(rootDir);
  return principals.some((entry) => entry.public_key === publicKey);
}

/** True when entry carries AgentProfile knobs (not mere trust pubkey). */
export function entryHasProfileFields(entry: PrincipalEntry): boolean {
  return (
    entry.default === true ||
    entry.default_path_constraints !== undefined ||
    entry.max_bound_files !== undefined ||
    entry.max_context_chars !== undefined ||
    entry.max_depth !== undefined
  );
}

function toProfile(entry: PrincipalEntry): AgentProfile {
  const profile: AgentProfile = {
    agent_id: entry.id,
    public_key: entry.public_key,
  };
  if (entry.default === true) profile.default = true;
  if (entry.default_path_constraints !== undefined) {
    profile.default_path_constraints = [...entry.default_path_constraints];
  }
  if (entry.max_bound_files !== undefined) {
    profile.max_bound_files = entry.max_bound_files;
  }
  if (entry.max_context_chars !== undefined) {
    profile.max_context_chars = entry.max_context_chars;
  }
  if (entry.max_depth !== undefined) profile.max_depth = entry.max_depth;
  return profile;
}

/**
 * Resolve actor → AgentProfile.
 * Builtin CI override always resolves. Trust-only principals (id+key) ⇒ null
 * so legacy runs stay bit-identical until profile fields are set.
 */
export function resolveProfile(
  rootDir: string,
  actor: string,
): AgentProfile | null {
  const trimmed = actor.trim();
  if (!trimmed) return null;
  if (trimmed === BUILTIN_CI_OVERRIDE_AGENT_ID) {
    return { ...BUILTIN_CI_OVERRIDE_PROFILE };
  }
  const entry = loadPrincipals(rootDir).principals.find((p) => p.id === trimmed);
  if (!entry || !entryHasProfileFields(entry)) return null;
  return toProfile(entry);
}

/** Exactly one `default: true` when any profiles exist; else null. */
export function getDefaultProfile(rootDir = "."): AgentProfile | null {
  const withFields = loadPrincipals(rootDir).principals.filter(
    entryHasProfileFields,
  );
  const marked = withFields.filter((p) => p.default === true);
  if (marked.length === 1) return toProfile(marked[0]!);
  if (marked.length > 1) {
    return toProfile(marked[0]!);
  }
  return null;
}

/** Cheap supply-chain visibility hash (sha256 of canonical profile). */
export function profileHash(profile: AgentProfile): string {
  const body: Record<string, unknown> = { agent_id: profile.agent_id };
  if (profile.default === true) body.default = true;
  if (profile.public_key !== undefined) body.public_key = profile.public_key;
  if (profile.default_path_constraints !== undefined) {
    body.default_path_constraints = profile.default_path_constraints;
  }
  if (profile.max_bound_files !== undefined) {
    body.max_bound_files = profile.max_bound_files;
  }
  if (profile.max_context_chars !== undefined) {
    body.max_context_chars = profile.max_context_chars;
  }
  if (profile.max_depth !== undefined) body.max_depth = profile.max_depth;
  return crypto
    .createHash("sha256")
    .update(canonicalize(body), "utf8")
    .digest("hex");
}

/** Regulated CI: unknown actor (no profile) ⇒ DENY at Ward. */
export function isWardStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.VIBE_WARD_STRICT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Prefix intersection: keep the more-specific path when one prefixes the other.
 * Empty intersection ⇒ [] (caller decides fail vs fallback).
 */
export function intersectPathConstraints(
  mandatePaths: string[],
  profilePaths: string[],
): string[] {
  if (profilePaths.length === 0) return [...mandatePaths];
  if (mandatePaths.length === 0) return [];
  const out: string[] = [];
  for (const a of mandatePaths) {
    for (const b of profilePaths) {
      if (a === b || a.startsWith(b) || b.startsWith(a)) {
        out.push(a.length >= b.length ? a : b);
      }
    }
  }
  return [...new Set(out)];
}
