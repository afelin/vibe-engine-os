/**
 * Mandate–Ward: opt-in signed session budget.
 * Absent Mandate file ⇒ legacy house rules only (today's behavior).
 * House mandates.json AND SignedMandate (Mandate cannot widen forbids).
 */
import * as fs from "node:fs";
import * as path from "node:path";
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
export const GITHUB_CI_BOT_OVERRIDE = "github-ci-bot-override";
export const OVERRIDE_KIND_GITHUB_COMMENT = "github_comment_approve" as const;
export type MandateOverrideKind = typeof OVERRIDE_KIND_GITHUB_COMMENT;

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
};

export type PrincipalEntry = {
  id: string;
  public_key: string;
};

export type PrincipalsFile = {
  principals: PrincipalEntry[];
};

const ACTIVE_MANDATE_REL = path.join(".vibe", "active_mandate.json");
const PRINCIPALS_VIBE_REL = path.join(".vibe", "principals.json");
const PRINCIPALS_POLICY_REL = path.join("src", "policy", "principals.json");

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
    return {
      principals: Array.isArray(raw.principals) ? raw.principals : [],
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

  const withOverride = (
    decision: Omit<WardDecision, "override_kind">,
  ): WardDecision =>
    mandate.override_kind
      ? { ...decision, override_kind: mandate.override_kind }
      : decision;

  const deny = (reason: string): WardAssertResult => {
    const decision = withOverride({
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
    const decision = withOverride({
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

  // Override Mandates are CI-bot signed; do not require runtime actor === bot id.
  if (
    !mandate.override_kind &&
    opts?.actor &&
    mandate.authorized_actor &&
    opts.actor !== mandate.authorized_actor &&
    mandate.authorized_actor !== "*"
  ) {
    return deny(`actor_not_authorized:${opts.actor}`);
  }

  if (filePath) {
    if (isUnsafeProposedPath(filePath)) {
      return deny("unsafe_path");
    }
    const filtered = pathFilter([filePath], mandate.path_constraints);
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
 */
export function assertPromoteWard(
  rootDir: string,
  runId: string,
  opts?: { codegenRan?: boolean },
): { ok: boolean; reason?: string } {
  const state = readWardRunState(rootDir, runId);
  if (!state) return { ok: true };

  if (!hasWardAllow(rootDir, runId, "promote")) {
    return {
      ok: false,
      reason: `ward: promote requires ALLOW receipt (mandate_id=${state.mandate_id})`,
    };
  }
  if (opts?.codegenRan && !hasWardAllow(rootDir, runId, "codegen")) {
    return {
      ok: false,
      reason: `ward: codegen ALLOW required before promote (mandate_id=${state.mandate_id})`,
    };
  }
  return { ok: true };
}

/** Cap vibe depth when Mandate sets max_depth. */
export function effectiveDepth(
  current: number,
  verified: VerifiedMandate | null,
): number {
  if (!verified?.mandate.max_depth && verified?.mandate.max_depth !== 0) {
    return current;
  }
  return Math.min(current, verified.mandate.max_depth);
}

export {
  bytesToBase64Url,
  base64UrlToBytes,
  generateEd25519KeyPairRaw,
} from "./crypto.js";
