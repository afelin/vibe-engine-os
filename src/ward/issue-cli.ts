/**
 * CLI: npm run mandate:issue
 * Signs a Mandate with VIBE_MANDATE_PRIVATE_KEY; writes .vibe/active_mandate.json
 * and optionally updates principals with the public key.
 *
 * Usage:
 *   mandate:issue [root_dir]
 * Env:
 *   VIBE_MANDATE_PRIVATE_KEY  (required, pkcs8 base64url)
 *   VIBE_MANDATE_PUBLIC_KEY   (required, raw base64url — must match private)
 *   VIBE_MANDATE_ACTOR        (default: *)
 *   VIBE_MANDATE_PATHS        (comma prefixes, default: src/,tests/)
 *   VIBE_MANDATE_ACTIONS      (comma, default: all)
 *   VIBE_MANDATE_TTL_HOURS    (default: 8)
 *   VIBE_MANDATE_MAX_DEPTH    (optional 0-5)
 *   VIBE_MANDATE_ID           (optional)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadPrincipals,
  signMandate,
  WARD_ACTIONS,
  writeActiveMandate,
  type WardAction,
} from "./index.js";

const rootDir = process.argv[2] ?? ".";

async function main(): Promise<void> {
  const privateKey = process.env.VIBE_MANDATE_PRIVATE_KEY?.trim();
  const publicKey = process.env.VIBE_MANDATE_PUBLIC_KEY?.trim();

  if (!privateKey) {
    console.error(
      "mandate:issue failed: VIBE_MANDATE_PRIVATE_KEY is required (pkcs8 base64url, env-only).",
    );
    process.exit(1);
  }
  if (!publicKey) {
    console.error(
      "mandate:issue failed: VIBE_MANDATE_PUBLIC_KEY is required (raw base64url; trust via principals).",
    );
    process.exit(1);
  }

  const principals = loadPrincipals(rootDir);
  if (!principals.principals.some((p) => p.public_key === publicKey)) {
    const vibePrincipals = path.join(rootDir, ".vibe", "principals.json");
    fs.mkdirSync(path.dirname(vibePrincipals), { recursive: true });
    const next = {
      principals: [
        ...principals.principals,
        { id: "issuer", public_key: publicKey },
      ],
    };
    fs.writeFileSync(
      vibePrincipals,
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8",
    );
    console.error(
      `mandate:issue: wrote missing pubkey to ${vibePrincipals} (public keys only).`,
    );
  }

  const actor = process.env.VIBE_MANDATE_ACTOR?.trim() || "*";
  const pathsRaw = process.env.VIBE_MANDATE_PATHS?.trim() || "src/,tests/";
  const pathConstraints = pathsRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const actionsRaw = process.env.VIBE_MANDATE_ACTIONS?.trim();
  const actions: WardAction[] = actionsRaw
    ? (actionsRaw
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean) as WardAction[])
    : [...WARD_ACTIONS];

  for (const action of actions) {
    if (!(WARD_ACTIONS as readonly string[]).includes(action)) {
      console.error(`mandate:issue failed: unknown action ${action}`);
      process.exit(1);
    }
  }

  const ttlHours = Number(process.env.VIBE_MANDATE_TTL_HOURS ?? "8");
  const ttlMs =
    Number.isFinite(ttlHours) && ttlHours > 0
      ? ttlHours * 60 * 60 * 1000
      : 8 * 60 * 60 * 1000;

  const now = Date.now();
  const maxDepthRaw = process.env.VIBE_MANDATE_MAX_DEPTH?.trim();
  const max_depth =
    maxDepthRaw !== undefined && maxDepthRaw !== ""
      ? Number(maxDepthRaw)
      : undefined;
  if (
    max_depth !== undefined &&
    (!Number.isInteger(max_depth) || max_depth < 0 || max_depth > 5)
  ) {
    console.error("mandate:issue failed: VIBE_MANDATE_MAX_DEPTH must be 0..5");
    process.exit(1);
  }

  const unsigned = {
    mandate_id:
      process.env.VIBE_MANDATE_ID?.trim() ||
      `mandate-${now.toString(36)}`,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMs).toISOString(),
    authorized_actor: actor,
    path_constraints: pathConstraints,
    actions,
    ...(max_depth !== undefined ? { max_depth } : {}),
    issuer_public_key: publicKey,
  };

  const mandate = await signMandate(unsigned, privateKey);
  writeActiveMandate(rootDir, mandate);
  console.log(`mandate_id=${mandate.mandate_id}`);
  console.log(`path=${path.join(rootDir, ".vibe", "active_mandate.json")}`);
  console.log(`expires_at=${mandate.expires_at}`);
  console.log(JSON.stringify(mandate, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("mandate:issue failed:", message);
  process.exit(1);
});
