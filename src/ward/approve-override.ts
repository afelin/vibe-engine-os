/**
 * Option B: keep plain-text /approve. CI may sign a short-lived override Mandate
 * with runner key, but MUST tag override_kind and authorized_actor as the bot —
 * never attribute runner-key signatures to the human principal.
 *
 * Without VIBE_MANDATE_PRIVATE_KEY ⇒ legacy unsigned approve (no Mandate write).
 */
import {
  GITHUB_CI_BOT_OVERRIDE,
  OVERRIDE_KIND_GITHUB_COMMENT,
  generateEd25519KeyPairRaw,
  loadActiveMandate,
  loadPrincipals,
  signMandate,
  writeActiveMandate,
  type SignedMandate,
  type WardAction,
  WARD_ACTIONS,
} from "./index.js";

const DEFAULT_OVERRIDE_ACTIONS: WardAction[] = [...WARD_ACTIONS];
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

export type ApprovalOverrideResult =
  | { issued: false; reason: string }
  | { issued: true; mandate: SignedMandate };

/**
 * Issue a short-lived CI-bot override Mandate after operator /approve comment.
 * `approving_comment_actor` records who typed /approve (audit only).
 * `authorized_actor` is always github-ci-bot-override (signing principal).
 */
export async function maybeIssueApprovalOverride(opts: {
  rootDir?: string;
  /** GitHub login who typed plain-text /approve (audit; not signing principal). */
  actor: string;
  pathConstraints?: string[];
  ttlMs?: number;
  privateKeyEnv?: string;
  publicKeyEnv?: string;
}): Promise<ApprovalOverrideResult> {
  const rootDir = opts.rootDir ?? ".";
  const privateKey =
    opts.privateKeyEnv ?? process.env.VIBE_MANDATE_PRIVATE_KEY?.trim();
  if (!privateKey) {
    return {
      issued: false,
      reason: "legacy_approve: VIBE_MANDATE_PRIVATE_KEY unset",
    };
  }

  const existing = loadActiveMandate(rootDir);
  const publicKey =
    opts.publicKeyEnv ??
    process.env.VIBE_MANDATE_PUBLIC_KEY?.trim() ??
    existing?.issuer_public_key;

  if (!publicKey) {
    return {
      issued: false,
      reason: "legacy_approve: no issuer public key (set VIBE_MANDATE_PUBLIC_KEY)",
    };
  }

  const principals = loadPrincipals(rootDir);
  if (!principals.principals.some((p) => p.public_key === publicKey)) {
    return {
      issued: false,
      reason: "legacy_approve: public key not in principals trust file",
    };
  }

  const now = Date.now();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const pathConstraints =
    opts.pathConstraints ??
    existing?.path_constraints ??
    ["src/", "tests/"];

  const unsigned = {
    mandate_id: `approve-override-${GITHUB_CI_BOT_OVERRIDE}-${now}`,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl).toISOString(),
    authorized_actor: GITHUB_CI_BOT_OVERRIDE,
    path_constraints: pathConstraints,
    actions: existing?.actions ?? DEFAULT_OVERRIDE_ACTIONS,
    max_depth: existing?.max_depth,
    override_kind: OVERRIDE_KIND_GITHUB_COMMENT,
    approving_comment_actor: opts.actor,
    issuer_public_key: publicKey,
  };

  try {
    const mandate = await signMandate(unsigned, privateKey);
    writeActiveMandate(rootDir, mandate);
    return { issued: true, mandate };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { issued: false, reason: `legacy_approve: sign failed (${message})` };
  }
}

/** Dev helper: generate a keypair for principals + env (never commit private). */
export async function generateMandateKeyPairForOps(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  return generateEd25519KeyPairRaw();
}
