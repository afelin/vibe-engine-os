/**
 * Ward doctor — one command to check regulated CI readiness (<15 min setup).
 * Fail closed on: forever.yml missing STRICT; active Mandate with `*`;
 * Mandate present but principals empty. Secrets are hints only.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadPrincipals } from "../agent-id/index.js";
import { loadActiveMandate } from "./index.js";

export type WardDoctorCheck = {
  id: string;
  ok: boolean;
  detail: string;
  /** Hint-only checks never fail the doctor hard gate. */
  soft?: boolean;
};

export type WardDoctorResult = {
  ok: boolean;
  checks: WardDoctorCheck[];
};

function readForeverWorkflow(rootDir: string): string | null {
  const filePath = path.join(rootDir, ".github", "workflows", "forever.yml");
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

export function checkStrictInWorkflow(rootDir = "."): WardDoctorCheck {
  const workflow = readForeverWorkflow(rootDir);
  if (!workflow) {
    return {
      id: "workflow:strict",
      ok: false,
      detail: "missing .github/workflows/forever.yml",
    };
  }
  const hasStrict =
    /VIBE_WARD_STRICT\s*:\s*["']?1["']?/.test(workflow) ||
    /VIBE_WARD_STRICT=1/.test(workflow);
  return {
    id: "workflow:strict",
    ok: hasStrict,
    detail: hasStrict
      ? "VIBE_WARD_STRICT=1 present in forever.yml"
      : "forever.yml missing VIBE_WARD_STRICT=1 (regulated CI mode)",
  };
}

export function checkMandateActor(rootDir = "."): WardDoctorCheck {
  const mandate = loadActiveMandate(rootDir);
  if (!mandate) {
    return {
      id: "mandate:actor",
      ok: true,
      detail: "no active Mandate (legacy house-only — ok)",
    };
  }
  if (mandate.authorized_actor === "*") {
    return {
      id: "mandate:actor",
      ok: false,
      detail: "active Mandate has authorized_actor='*' — re-issue with a real actor",
    };
  }
  return {
    id: "mandate:actor",
    ok: true,
    detail: `authorized_actor=${mandate.authorized_actor}`,
  };
}

export function checkPrincipalsIfMandate(rootDir = "."): WardDoctorCheck {
  const mandate = loadActiveMandate(rootDir);
  if (!mandate) {
    return {
      id: "principals:nonempty",
      ok: true,
      detail: "no Mandate — principals check skipped",
    };
  }
  const { principals } = loadPrincipals(rootDir);
  if (principals.length === 0) {
    return {
      id: "principals:nonempty",
      ok: false,
      detail: "Mandate present but principals trust file is empty",
    };
  }
  return {
    id: "principals:nonempty",
    ok: true,
    detail: `${principals.length} principal(s) loaded`,
  };
}

export function checkSecretsHints(
  env: NodeJS.ProcessEnv = process.env,
): WardDoctorCheck[] {
  const privateKey = Boolean(env.VIBE_MANDATE_PRIVATE_KEY?.trim());
  const publicKey = Boolean(env.VIBE_MANDATE_PUBLIC_KEY?.trim());
  return [
    {
      id: "secrets:private_key",
      ok: privateKey,
      soft: true,
      detail: privateKey
        ? "VIBE_MANDATE_PRIVATE_KEY set"
        : "hint: set VIBE_MANDATE_PRIVATE_KEY to issue Mandates",
    },
    {
      id: "secrets:public_key",
      ok: publicKey,
      soft: true,
      detail: publicKey
        ? "VIBE_MANDATE_PUBLIC_KEY set"
        : "hint: set VIBE_MANDATE_PUBLIC_KEY (must match private; trust via principals)",
    },
  ];
}

export function runWardDoctor(
  rootDir = ".",
  env: NodeJS.ProcessEnv = process.env,
): WardDoctorResult {
  const checks: WardDoctorCheck[] = [
    checkStrictInWorkflow(rootDir),
    checkMandateActor(rootDir),
    checkPrincipalsIfMandate(rootDir),
    ...checkSecretsHints(env),
  ];
  const hard = checks.filter((c) => !c.soft);
  return {
    ok: hard.every((c) => c.ok),
    checks,
  };
}
