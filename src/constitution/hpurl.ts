/**
 * HPURL proof link primitives (spec-01).
 * Fragment format: `#?key=value` — params never reach the server.
 */

export type ProofHpurlParams = {
  runId: string;
  capsuleHash: string;
  vowsHash: string;
  repo?: string;
  api?: string;
};

export type ParsedProofHpurl = ProofHpurlParams & {
  /** Reserved `$` — Ed25519 signature (base64url). */
  signature?: string;
  /** Reserved `@` — Ed25519 public key (base64url raw). */
  publicKey?: string;
  /** Reserved `!` — scope bitmask. */
  scope?: string;
};

const RESERVED_SIG = "$";
const RESERVED_PUBKEY = "@";
const RESERVED_SCOPE = "!";

export const DEFAULT_PROOF_BASE =
  "https://afelin.github.io/vibe-engine-os/proof";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function buildCanonicalSearchParams(
  params: ProofHpurlParams,
  extra?: Record<string, string>,
): URLSearchParams {
  const search = new URLSearchParams();
  search.set("run", params.runId);
  search.set("capsule", params.capsuleHash);
  search.set("vows", params.vowsHash);
  if (params.repo) search.set("repo", params.repo);
  if (params.api) search.set("api", params.api);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      search.set(key, value);
    }
  }
  return search;
}

export function buildProofHpurl(
  baseUrl: string,
  params: ProofHpurlParams,
): string {
  const search = buildCanonicalSearchParams(params);
  return `${normalizeBaseUrl(baseUrl)}#?${search.toString()}`;
}

export function parseProofHpurl(url: string): ParsedProofHpurl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hash = parsed.hash;
  if (!hash.startsWith("#?")) return null;

  const search = new URLSearchParams(hash.slice(2));
  const runId = search.get("run");
  const capsuleHash = search.get("capsule");
  const vowsHash = search.get("vows");
  if (!runId || !capsuleHash || !vowsHash) return null;

  const repo = search.get("repo") ?? undefined;
  const api = search.get("api") ?? undefined;
  const signature = search.get(RESERVED_SIG) ?? undefined;
  const publicKey = search.get(RESERVED_PUBKEY) ?? undefined;
  const scope = search.get(RESERVED_SCOPE) ?? undefined;

  return {
    runId,
    capsuleHash,
    vowsHash,
    repo,
    api,
    signature,
    publicKey,
    scope,
  };
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(view).toString("base64url");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(value, "base64url"));
}

export async function generateProofSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
}

export async function signProofHpurl(
  baseUrl: string,
  params: ProofHpurlParams,
  keyPair: CryptoKeyPair,
): Promise<string> {
  const canonical = buildCanonicalSearchParams(params).toString();
  const signature = await crypto.subtle.sign(
    "Ed25519",
    keyPair.privateKey,
    new TextEncoder().encode(canonical),
  );
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);

  const signed = buildCanonicalSearchParams(params, {
    [RESERVED_SIG]: bytesToBase64Url(signature),
    [RESERVED_PUBKEY]: bytesToBase64Url(publicKeyRaw),
  });

  return `${normalizeBaseUrl(baseUrl)}#?${signed.toString()}`;
}

export async function verifyProofHpurl(url: string): Promise<boolean> {
  const parsed = parseProofHpurl(url);
  if (!parsed?.signature || !parsed.publicKey) {
    throw new Error("HPURL v1.1: signed proof requires $ and @ params");
  }

  const canonical = buildCanonicalSearchParams({
    runId: parsed.runId,
    capsuleHash: parsed.capsuleHash,
    vowsHash: parsed.vowsHash,
    repo: parsed.repo,
    api: parsed.api,
  }).toString();

  const publicKey = await crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(parsed.publicKey),
    "Ed25519",
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    "Ed25519",
    publicKey,
    base64UrlToBytes(parsed.signature),
    new TextEncoder().encode(canonical),
  );
}
