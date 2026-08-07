/**
 * CLI: npm run mandate:issue
 * Signs a Mandate with VIBE_MANDATE_PRIVATE_KEY; writes .vibe/active_mandate.json
 * and optionally updates principals with the public key.
 *
 * Zero-arg defaults come from the default AgentProfile when present.
 *
 * Usage:
 *   mandate:issue [root_dir]
 * Env:
 *   VIBE_MANDATE_PRIVATE_KEY  (required, pkcs8 base64url)
 *   VIBE_MANDATE_PUBLIC_KEY   (required, raw base64url — must match private)
 *   VIBE_MANDATE_ACTOR        (default: profile.agent_id or *)
 *   VIBE_MANDATE_PATHS        (comma prefixes; default: profile paths or src/,tests/)
 *   VIBE_MANDATE_ACTIONS      (comma, default: all)
 *   VIBE_MANDATE_TTL_HOURS    (default: 8)
 *   VIBE_MANDATE_MAX_DEPTH    (optional 0-5; default: profile.max_depth)
 *   VIBE_MANDATE_ID           (optional)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getDefaultProfile,
  intersectPathConstraints,
  loadPrincipals,
  type PrincipalEntry,
} from "../agent-id/index.js";
import {
  signMandate,
  WARD_ACTIONS,
  writeActiveMandate,
  type WardAction,
} from "./index.js";

const rootDir = process.argv[2] ?? ".";

function writePrincipals(rootDir: string, principals: PrincipalEntry[]): void {
  const vibePrincipals = path.join(rootDir, ".vibe", "principals.json");
  fs.mkdirSync(path.dirname(vibePrincipals), { recursive: true });
  fs.writeFileSync(
    vibePrincipals,
    `${JSON.stringify({ principals }, null, 2)}\n`,
    "utf8",
  );
}

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

  const loaded = loadPrincipals(rootDir);
  let principals = [...loaded.principals];
  let defaultProfile = getDefaultProfile(rootDir);

  if (!principals.some((p) => p.public_key === publicKey)) {
    const skeleton: PrincipalEntry = {
      id: "issuer",
      public_key: publicKey,
      default: true,
      default_path_constraints: ["src/", "tests/"],
    };
    principals = [...principals, skeleton];
    writePrincipals(rootDir, principals);
    console.error(
      `mandate:issue: wrote issuer skeleton (default profile) to .vibe/principals.json`,
    );
    defaultProfile = getDefaultProfile(rootDir);
  }

  const actorEnv = process.env.VIBE_MANDATE_ACTOR?.trim();
  const actor =
    actorEnv ||
    defaultProfile?.agent_id ||
    "*";

  const pathsEnv = process.env.VIBE_MANDATE_PATHS?.trim();
  let pathConstraints: string[];
  if (pathsEnv) {
    pathConstraints = pathsEnv
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  } else if (
    defaultProfile?.default_path_constraints &&
    defaultProfile.default_path_constraints.length > 0
  ) {
    pathConstraints = [...defaultProfile.default_path_constraints];
  } else {
    pathConstraints = ["src/", "tests/"];
  }

  // Preflight: intersection with profile constraints (tighten-only; never widen).
  if (
    defaultProfile?.default_path_constraints &&
    defaultProfile.default_path_constraints.length > 0
  ) {
    const intersected = intersectPathConstraints(
      pathConstraints,
      defaultProfile.default_path_constraints,
    );
    if (intersected.length === 0) {
      console.error(
        "mandate:issue failed: path constraints have empty intersection with default AgentProfile (would brick session).",
      );
      process.exit(1);
    }
    pathConstraints = intersected;
  }

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
  let max_depth: number | undefined;
  if (maxDepthRaw !== undefined && maxDepthRaw !== "") {
    max_depth = Number(maxDepthRaw);
  } else if (defaultProfile?.max_depth !== undefined) {
    max_depth = defaultProfile.max_depth;
  }
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
  if (defaultProfile) {
    console.log(`agent_id=${defaultProfile.agent_id}`);
  }
  console.log(JSON.stringify(mandate, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("mandate:issue failed:", message);
  process.exit(1);
});
