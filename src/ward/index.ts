/**
 * Mandate–Ward: opt-in signed session budget.
 * Absent Mandate file ⇒ legacy house rules only (today's behavior).
 * House mandates.json AND SignedMandate (Mandate cannot widen forbids).
 * AgentId: Ward consumes `src/agent-id` (never the reverse).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  BUILTIN_CI_OVERRIDE_AGENT_ID,
  intersectPathConstraints,
  isTrustedPublicKey,
  isWardStrict,
  loadPrincipals,
  profileHash,
  resolveProfile,
  type AgentProfile,
  type PrincipalEntry,
  type PrincipalsFile,
} from "../agent-id/index.js";
import { canonicalize } from "../constitution/capsule.js";
import {
  evaluateMandates,
  isUnsafeProposedPath,
  loadMandates,
  normalizeProposedPath,
  type Mandates,
} from "../policy/evaluate.js";
import { appendOsEvent } from "../os/replay.js";
import { resolveRunDir, sanitizeRunId } from "../run/paths.js";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  importEd25519PrivateKey,
  importEd25519PublicKey,
  signBytes,
  verifyBytes,
} from "./crypto.js";

export type WardAction = "bond.seal" | "codegen" | "patch.apply" | "promote";

export const WARD_ACTIONS = [
  "bond.seal",
  "codegen",
  "patch.apply",
  "promote",
] as const satisfies readonly WardAction[];

/** CI-signed /approve override — never attribute runner key to the human. */
export const GITHUB_CI_BOT_OVERRIDE = BUILTIN_CI_OVERRIDE_AGENT_ID;
export const OVERRIDE_KIND_GITHUB_COMMENT = "github_comment_approve" as const;
export type MandateOverrideKind = typeof OVERRIDE_KIND_GITHUB_COMMENT;

export type {
  AgentProfile,
  PrincipalEntry,
  PrincipalsFile,
};
export {
  loadPrincipals,
  isTrustedPublicKey,
  resolveProfile,
  isWardStrict,
};

/** Unsigned body + crypto fields (catalog SignedMandate). */
export type SignedMandate = {
  mandate_id: string;
  issued_at: string;
  expires_at: string;
  authorized_actor: string;
  path_constraints: string[];
  actions: WardAction[];
  max_depth?: number;
  override_kind?: MandateOverrideKind;
  /** Audit: who typed /approve — not the Ed25519 principal. */
  approving_comment_actor?: string;
  issuer_public_key: string;
  signature: string;
};

export type VerifiedMandate = {
  mandate: SignedMandate;
  verifiedAt: string;
};

export type WardDecision = {
  type: "ward_decision";
  mandate_id: string;
  action: WardAction;
  path?: string;
  verdict: "ALLOW" | "DENY";
  reason: string;
  at: string;
  override_kind?: MandateOverrideKind;
  agent_id?: string;
};

export type WardAssertResult = {
  ok: boolean;
  decision: WardDecision;
};

export type WardRunState = {
  mandate_id: string;
  verified_at: string;
  path_constraints: string[];
  actions: WardAction[];
  max_depth?: number;
  authorized_actor: string;
  /** Present when an AgentProfile resolved for authorized_actor. */
  agent_id?: string;
  profile_hash?: string;
  max_bound_files?: number;
  max_context_chars?: number;
};

export type EffectiveBudget = {
  path_constraints: string[];
  max_depth?: number;
  max_bound_files?: number;
  max_context_chars?: number;
  agent_id?: string;
  profile_hash?: string;
};

const ACTIVE_MANDATE_REL = path.join(".vibe", "active_mandate.json");

/** Per-run verifyOnce cache (process-local). */
const verifyCache = new Map<string, VerifiedMandate>();

export function activeMandatePath(rootDir: string): string {
  return path.join(rootDir, ACTIVE_MANDATE_REL);
}

export function loadActiveMandate(rootDir = "."): SignedMandate | null {
  const filePath = activeMandatePath(rootDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as SignedMandate;
    if (!raw?.mandate_id || !raw?.signature || !raw?.issuer_public_key) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function writeActiveMandate(
  rootDir: string,
  mandate: SignedMandate,
): void {
  const filePath = activeMandatePath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(mandate, null, 2)}\n`, "utf8");
}

export function clearActiveMandate(rootDir: string): void {
  const filePath = activeMandatePath(rootDir);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export type EffectiveBudgetResult =
  | { ok: true; budget: EffectiveBudget }
  | { ok: false; reason: string };

/**
 * Tighten-only budget: profile ∩ mandate (never widens).
 * No profile ⇒ mandate paths/depth unchanged (legacy bit-identical).
 * Empty intersection ⇒ DENY (fail-closed; never fall back to wider mandate).
 */
export function resolveEffectiveBudget(
  mandate: Pick<SignedMandate, "path_constraints" | "max_depth" | "authorized_actor">,
  profile: AgentProfile | null,
): EffectiveBudget {
  const result = resolveEffectiveBudgetStrict(mandate, profile);
  if (!result.ok) {
    // Compat for callers that ignore empty-intersection DENY — return empty paths.
    return { path_constraints: [] };
  }
  return result.budget;
}

/** Fail-closed budget resolve (empty ∩ ⇒ DENY). Prefer this at Ward gates. */
export function resolveEffectiveBudgetStrict(
  mandate: Pick<SignedMandate, "path_constraints" | "max_depth" | "authorized_actor">,
  profile: AgentProfile | null,
): EffectiveBudgetResult {
  if (!profile) {
    return {
      ok: true,
      budget: {
        path_constraints: [...mandate.path_constraints],
        ...(mandate.max_depth !== undefined ? { max_depth: mandate.max_depth } : {}),
      },
    };
  }

  let path_constraints = [...mandate.path_constraints];
  if (
    profile.default_path_constraints &&
    profile.default_path_constraints.length > 0
  ) {
    const intersected = intersectPathConstraints(
      mandate.path_constraints,
      profile.default_path_constraints,
    );
    if (intersected.length === 0) {
      return { ok: false, reason: "empty_path_intersection" };
    }
    path_constraints = intersected;
  }

  let max_depth = mandate.max_depth;
  if (profile.max_depth !== undefined) {
    max_depth =
      max_depth === undefined
        ? profile.max_depth
        : Math.min(max_depth, profile.max_depth);
  }

  const budget: EffectiveBudget = {
    path_constraints,
    agent_id: profile.agent_id,
    profile_hash: profileHash(profile),
  };
  if (max_depth !== undefined) budget.max_depth = max_depth;
  if (profile.max_bound_files !== undefined) {
    budget.max_bound_files = profile.max_bound_files;
  }
  if (profile.max_context_chars !== undefined) {
    budget.max_context_chars = profile.max_context_chars;
  }
  return { ok: true, budget };
}

/** Resolve profile for mandate authorized_actor (builtin CI included). */
export function resolveMandateProfile(
  rootDir: string,
  mandate: Pick<SignedMandate, "authorized_actor">,
): AgentProfile | null {
  return resolveProfile(rootDir, mandate.authorized_actor);
}

/** Canonical bytes for signing: mandate without `signature`. */
export function canonicalizeMandateForSign(
  mandate: Omit<SignedMandate, "signature"> | SignedMandate,
): string {
  const {
    mandate_id,
    issued_at,
    expires_at,
    authorized_actor,
    path_constraints,
    actions,
    max_depth,
    override_kind,
    approving_comment_actor,
    issuer_public_key,
  } = mandate;
  const body: Record<string, unknown> = {
    mandate_id,
    issued_at,
    expires_at,
    authorized_actor,
    path_constraints,
    actions,
    issuer_public_key,
  };
  if (max_depth !== undefined) body.max_depth = max_depth;
  if (override_kind !== undefined) body.override_kind = override_kind;
  if (approving_comment_actor !== undefined) {
    body.approving_comment_actor = approving_comment_actor;
  }
  return canonicalize(body);
}

export async function signMandate(
  unsigned: Omit<SignedMandate, "signature">,
  privateKeyRawBase64Url: string,
): Promise<SignedMandate> {
  const privateKey = await importEd25519PrivateKey(privateKeyRawBase64Url);
  const canonical = canonicalizeMandateForSign(unsigned);
  const signature = await signBytes(
    privateKey,
    new TextEncoder().encode(canonical),
  );
  return {
    ...unsigned,
    signature: bytesToBase64Url(signature),
  };
}

export async function verifyMandateSignature(
  mandate: SignedMandate,
): Promise<boolean> {
  const publicKey = await importEd25519PublicKey(mandate.issuer_public_key);
  const canonical = canonicalizeMandateForSign(mandate);
  return verifyBytes(
    publicKey,
    base64UrlToBytes(mandate.signature),
    new TextEncoder().encode(canonical),
  );
}

function cacheKey(rootDir: string, mandateId: string): string {
  return `${path.resolve(rootDir)}::${mandateId}`;
}

/**
 * Verify signature once per run; cache VerifiedMandate.
 * Throws / returns null-path via result for forged keys.
 */
export async function verifyOnce(
  mandate: SignedMandate,
  rootDir = ".",
  opts?: { now?: Date; skipTrust?: boolean },
): Promise<VerifiedMandate> {
  const key = cacheKey(rootDir, mandate.mandate_id);
  const cached = verifyCache.get(key);
  if (cached) return cached;

  if (!opts?.skipTrust && !isTrustedPublicKey(mandate.issuer_public_key, rootDir)) {
    throw new Error(
      `ward: issuer public key not in principals trust file (mandate_id=${mandate.mandate_id})`,
    );
  }

  const ok = await verifyMandateSignature(mandate);
  if (!ok) {
    throw new Error(
      `ward: signature verification failed (mandate_id=${mandate.mandate_id})`,
    );
  }

  const now = opts?.now ?? new Date();
  if (Number.isNaN(Date.parse(mandate.expires_at))) {
    throw new Error(`ward: invalid expires_at (mandate_id=${mandate.mandate_id})`);
  }
  if (now.getTime() > Date.parse(mandate.expires_at)) {
    throw new Error(
      `ward: mandate_expired at verify (mandate_id=${mandate.mandate_id})`,
    );
  }

  const verified: VerifiedMandate = {
    mandate,
    verifiedAt: now.toISOString(),
  };
  verifyCache.set(key, verified);
  return verified;
}

/** Test/helper: clear process-local verify cache. */
export function clearVerifyCache(): void {
  verifyCache.clear();
}

/**
 * Keep paths inside Mandate path_constraints (prefix match).
 * Empty constraints ⇒ empty result (fail-closed for shrink).
 */
export function pathFilter(
  paths: string[],
  pathConstraints: string[],
): string[] {
  if (pathConstraints.length === 0) return [];
  return paths.filter((raw) => {
    if (isUnsafeProposedPath(raw)) return false;
    const normalized = normalizeProposedPath(raw);
    return pathConstraints.some(
      (prefix) =>
        normalized.startsWith(prefix) ||
        normalized === prefix.replace(/\/$/, ""),
    );
  });
}

export function appendWardDecision(
  rootDir: string,
  runId: string,
  decision: WardDecision,
): void {
  appendOsEvent(rootDir, sanitizeRunId(runId), decision);
}

function wardStatePath(rootDir: string, runId: string): string {
  return path.join(resolveRunDir(rootDir, sanitizeRunId(runId)), "ward.json");
}

function runMandatePath(rootDir: string, runId: string): string {
  return path.join(resolveRunDir(rootDir, sanitizeRunId(runId)), "mandate.json");
}

/** Persist Mandate copy under `.runs/<id>/` for promote re-verify (evidence + authz input). */
export function persistRunMandate(
  rootDir: string,
  runId: string,
  mandate: SignedMandate,
): void {
  const filePath = runMandatePath(rootDir, runId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(mandate, null, 2)}\n`, "utf8");
}

export function readRunMandate(
  rootDir: string,
  runId: string,
): SignedMandate | null {
  const filePath = runMandatePath(rootDir, runId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as SignedMandate;
    if (!raw?.mandate_id || !raw?.signature || !raw?.issuer_public_key) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function writeWardRunState(
  rootDir: string,
  runId: string,
  state: WardRunState,
): void {
  const filePath = wardStatePath(rootDir, runId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function readWardRunState(
  rootDir: string,
  runId: string,
): WardRunState | null {
  const filePath = wardStatePath(rootDir, runId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as WardRunState;
  } catch {
    return null;
  }
}

export function readWardDecisions(
  rootDir: string,
  runId: string,
): WardDecision[] {
  const filePath = path.join(
    resolveRunDir(rootDir, sanitizeRunId(runId)),
    "events.ndjson",
  );
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { type?: string };
      } catch {
        return null;
      }
    })
    .filter(
      (row): row is WardDecision =>
        Boolean(row && row.type === "ward_decision"),
    );
}

export function hasWardAllow(
  rootDir: string,
  runId: string,
  action: WardAction,
): boolean {
  return readWardDecisions(rootDir, runId).some(
    (d) => d.action === action && d.verdict === "ALLOW",
  );
}

/**
 * Gate B/C (Mandate budget) + house D (mandates.json). Mandate cannot widen forbids.
 * Profile only tightens effective path_constraints / depth.
 * Invariant: when Mandate present, authz = verifyOnce + house AND + actor
 * (STRICT / no `*`). Receipts never authorize.
 */
export function assertWard(
  action: WardAction,
  filePath: string | undefined,
  verified: VerifiedMandate,
  opts?: {
    rootDir?: string;
    runId?: string;
    house?: Mandates;
    now?: Date;
    actor?: string;
  },
): WardAssertResult {
  const rootDir = opts?.rootDir ?? ".";
  const now = opts?.now ?? new Date();
  const mandate = verified.mandate;
  const at = now.toISOString();
  const profile = resolveMandateProfile(rootDir, mandate);
  const budgetResult = resolveEffectiveBudgetStrict(mandate, profile);
  const budgetMeta = budgetResult.ok ? budgetResult.budget : undefined;

  const withMeta = (
    decision: Omit<WardDecision, "override_kind" | "agent_id">,
  ): WardDecision => {
    const next: WardDecision = { ...decision };
    if (mandate.override_kind) next.override_kind = mandate.override_kind;
    if (budgetMeta?.agent_id) next.agent_id = budgetMeta.agent_id;
    return next;
  };

  const deny = (reason: string): WardAssertResult => {
    const decision = withMeta({
      type: "ward_decision",
      mandate_id: mandate.mandate_id,
      action,
      path: filePath,
      verdict: "DENY",
      reason,
      at,
    });
    if (opts?.runId) appendWardDecision(rootDir, opts.runId, decision);
    return { ok: false, decision };
  };

  const allow = (reason: string): WardAssertResult => {
    const decision = withMeta({
      type: "ward_decision",
      mandate_id: mandate.mandate_id,
      action,
      path: filePath,
      verdict: "ALLOW",
      reason,
      at,
    });
    if (opts?.runId) appendWardDecision(rootDir, opts.runId, decision);
    return { ok: true, decision };
  };

  if (now.getTime() > Date.parse(mandate.expires_at)) {
    return deny("mandate_expired");
  }

  if (!mandate.actions.includes(action)) {
    return deny(`action_not_authorized:${action}`);
  }

  if (!budgetResult.ok) {
    return deny(budgetResult.reason);
  }
  const budget = budgetResult.budget;

  // Override Mandates are CI-bot signed; do not require runtime actor === bot id.
  if (!mandate.override_kind) {
    const actor = opts?.actor?.trim();
    // Missing actor ⇒ DENY whenever Mandate is in play (fail-closed).
    if (!actor) {
      return deny("actor_required");
    }

    // STRICT / regulated: wildcard actor never authorizes.
    if (isWardStrict() && mandate.authorized_actor === "*") {
      return deny("wildcard_actor_strict");
    }

    if (
      mandate.authorized_actor &&
      actor !== mandate.authorized_actor &&
      mandate.authorized_actor !== "*"
    ) {
      return deny(`actor_not_authorized:${actor}`);
    }

    // Non-STRICT still rejects `*` mismatch only when actor provided vs specific;
    // STRICT also rejects unknown actors (no AgentProfile).
    if (isWardStrict() && !resolveProfile(rootDir, actor)) {
      return deny(`unknown_actor_strict:${actor}`);
    }
  }

  if (filePath) {
    if (isUnsafeProposedPath(filePath)) {
      return deny("unsafe_path");
    }
    const filtered = pathFilter([filePath], budget.path_constraints);
    if (filtered.length === 0) {
      return deny(`path_outside_constraints:${filePath}`);
    }

    const house = opts?.house ?? loadMandates(rootDir);
    const houseEval = evaluateMandates([filePath], house);
    if (!houseEval.passed) {
      return deny(
        `house_forbidden:${houseEval.violations
          .filter((v) => v.rule === "forbidden")
          .map((v) => v.prefix)
          .join(",")}`,
      );
    }
  }

  return allow("ward_allow");
}

/**
 * Fail-closed promote when this run had a VerifiedMandate.
 * No ward.json ⇒ legacy promote (today's behavior).
 * Receipts (`ward_decision` / ward.json) are evidence only — never authorization.
 * Authz = live verifyOnce(principals) + expiry + pathFilter over bundle + actor/STRICT.
 */
export async function assertPromoteWard(
  rootDir: string,
  runId: string,
  opts?: {
    codegenRan?: boolean;
    now?: Date;
    actor?: string;
    /** Bundle paths to pathFilter; defaults to promotion index when present. */
    bundlePaths?: string[];
  },
): Promise<{ ok: boolean; reason?: string }> {
  const state = readWardRunState(rootDir, runId);
  if (!state) return { ok: true };

  const mandate = readRunMandate(rootDir, runId);
  if (!mandate) {
    return {
      ok: false,
      reason: `ward: promote requires persisted mandate.json (mandate_id=${state.mandate_id}); receipts never authorize`,
    };
  }

  let verified: VerifiedMandate;
  try {
    verified = await verifyOnce(mandate, rootDir, { now: opts?.now });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `ward: promote re-verify failed: ${message}` };
  }

  const now = opts?.now ?? new Date();
  if (now.getTime() > Date.parse(mandate.expires_at)) {
    return {
      ok: false,
      reason: `ward: mandate_expired at promote (mandate_id=${mandate.mandate_id})`,
    };
  }

  if (!mandate.actions.includes("promote")) {
    return {
      ok: false,
      reason: `ward: promote not in mandate actions (mandate_id=${mandate.mandate_id})`,
    };
  }

  const profile = resolveMandateProfile(rootDir, mandate);
  const budgetResult = resolveEffectiveBudgetStrict(mandate, profile);
  if (!budgetResult.ok) {
    return {
      ok: false,
      reason: `ward: ${budgetResult.reason} (mandate_id=${mandate.mandate_id})`,
    };
  }

  if (isWardStrict() && mandate.authorized_actor === "*") {
    return {
      ok: false,
      reason: `ward: wildcard_actor_strict at promote (mandate_id=${mandate.mandate_id})`,
    };
  }

  const actor = opts?.actor?.trim();
  if (!mandate.override_kind) {
    if (!actor) {
      return {
        ok: false,
        reason: `ward: actor_required at promote (mandate_id=${mandate.mandate_id})`,
      };
    }
    if (
      mandate.authorized_actor &&
      actor !== mandate.authorized_actor &&
      mandate.authorized_actor !== "*"
    ) {
      return {
        ok: false,
        reason: `ward: actor_not_authorized:${actor} (mandate_id=${mandate.mandate_id})`,
      };
    }
    if (isWardStrict() && !resolveProfile(rootDir, actor)) {
      return {
        ok: false,
        reason: `ward: unknown_actor_strict:${actor} (mandate_id=${mandate.mandate_id})`,
      };
    }
  }

  let bundlePaths = opts?.bundlePaths;
  if (!bundlePaths) {
    const indexPath = path.join(
      resolveRunDir(rootDir, sanitizeRunId(runId)),
      "promotion",
      "index.json",
    );
    if (fs.existsSync(indexPath)) {
      try {
        const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
          files?: Array<{ path?: string }>;
        };
        bundlePaths = (index.files ?? [])
          .map((f) => f.path)
          .filter((p): p is string => typeof p === "string" && p.length > 0);
      } catch {
        bundlePaths = [];
      }
    } else {
      bundlePaths = [];
    }
  }

  if (bundlePaths.length > 0) {
    const allowed = pathFilter(bundlePaths, budgetResult.budget.path_constraints);
    if (allowed.length !== bundlePaths.length) {
      const denied = bundlePaths.filter((p) => !allowed.includes(p));
      return {
        ok: false,
        reason: `ward: promote pathFilter denied: ${denied.join(",")}`,
      };
    }
    const house = loadMandates(rootDir);
    const houseEval = evaluateMandates(bundlePaths, house);
    if (!houseEval.passed) {
      return {
        ok: false,
        reason: `ward: house_forbidden at promote:${houseEval.violations
          .filter((v) => v.rule === "forbidden")
          .map((v) => v.prefix)
          .join(",")}`,
      };
    }
  }

  // Live gate (records receipt as evidence only — does not authorize via prior receipts).
  const live = assertWard("promote", undefined, verified, {
    rootDir,
    runId,
    now,
    actor: mandate.override_kind ? undefined : actor,
  });
  if (!live.ok) {
    return {
      ok: false,
      reason: `ward: promote live assert DENY (${live.decision.reason})`,
    };
  }

  // Evidence trail (non-authorizing): warn-style require when codegen ran in-session.
  if (opts?.codegenRan && !hasWardAllow(rootDir, runId, "codegen")) {
    return {
      ok: false,
      reason: `ward: codegen evidence missing before promote (mandate_id=${mandate.mandate_id})`,
    };
  }

  return { ok: true };
}

/** Cap vibe depth when Mandate (∩ profile) sets max_depth. */
export function effectiveDepth(
  current: number,
  verified: VerifiedMandate | null,
  rootDir = ".",
): number {
  if (!verified) return current;
  const profile = resolveMandateProfile(rootDir, verified.mandate);
  const budget = resolveEffectiveBudget(verified.mandate, profile);
  if (budget.max_depth === undefined) return current;
  return Math.min(current, budget.max_depth);
}

export {
  bytesToBase64Url,
  base64UrlToBytes,
  generateEd25519KeyPairRaw,
} from "./crypto.js";
