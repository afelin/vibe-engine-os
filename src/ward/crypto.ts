/**
 * Ed25519 helpers — same WebCrypto surface as hpurl (zero new deps).
 * Private keys: PKCS8 raw base64url (env-only). Public keys: raw 32-byte base64url.
 */

export function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(view).toString("base64url");
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(value, "base64url"));
}

export async function generateEd25519KeyPairRaw(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyPkcs8 = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  );
  return {
    publicKey: bytesToBase64Url(publicKeyRaw),
    privateKey: bytesToBase64Url(privateKeyPkcs8),
  };
}

export async function importEd25519PublicKey(
  publicKeyRawBase64Url: string,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(publicKeyRawBase64Url),
    "Ed25519",
    false,
    ["verify"],
  );
}

export async function importEd25519PrivateKey(
  privateKeyPkcs8Base64Url: string,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    base64UrlToBytes(privateKeyPkcs8Base64Url),
    "Ed25519",
    false,
    ["sign"],
  );
}

export async function signBytes(
  privateKey: CryptoKey,
  data: BufferSource,
): Promise<ArrayBuffer> {
  return crypto.subtle.sign("Ed25519", privateKey, data);
}

export async function verifyBytes(
  publicKey: CryptoKey,
  signature: BufferSource,
  data: BufferSource,
): Promise<boolean> {
  return crypto.subtle.verify("Ed25519", publicKey, signature, data);
}
