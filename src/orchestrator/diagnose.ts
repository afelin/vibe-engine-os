import type { TroubleshootPacket } from "../constitution/catalog.js";

export type DiagnosticCheck = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type DiagnosticClassification = {
  failureClass:
    | "preflight"
    | "replay"
    | "readiness"
    | "capsule"
    | "gauntlet"
    | "bond"
    | "unknown";
  gateId?: string;
  /** Matched TaskBond gauntlet case id when FAIL output cites one. */
  gauntletCaseId?: string;
  summary: string;
  checks: DiagnosticCheck[];
};

const ATTRIBUTION_CHECK_PATTERNS =
  /assisted-?by|attribution\s*audit|audit\s*assisted/i;
const NPM_CHECK_PATTERNS =
  /^npm\s*check\b|npm\s*check\s*\+|ci\s*\/\s*npm\s*check/i;

const REPLAY_PATTERNS = /replay|deterministic|snapshot mismatch|events\.ndjson/i;
const CAPSULE_PATTERNS = /capsule|vows|manifest/i;
const GAUNTLET_PATTERNS = /gauntlet|taskbond/i;
const BOND_PATTERNS = /bond|bound.?file/i;
const READINESS_PATTERNS = /readiness|workflow|proof page|launch/i;
const PROMOTION_PATTERNS =
  /promotion\s*gate|vibe\s*promotion|coreward\s*promotion|promotion\s*check|pr.?promotion|preflight.*promot/i;

/**
 * Static classify rows from top scoreboard `gateIdsFailed` + known gate cache ids.
 * Table growth only — no LLM.
 */
const GATE_SYMPTOM_TABLE: Array<{
  pattern: RegExp;
  failureClass: DiagnosticClassification["failureClass"];
  gateId: string;
}> = [
  { pattern: /\bvitest\b|test\s*suite\s*fail/i, failureClass: "preflight", gateId: "vitest" },
  {
    pattern: /\btsc\b|typescript|type.?error/i,
    failureClass: "preflight",
    gateId: "typescript_compiler",
  },
  { pattern: NPM_CHECK_PATTERNS, failureClass: "preflight", gateId: "npm_check" },
  {
    pattern: ATTRIBUTION_CHECK_PATTERNS,
    failureClass: "preflight",
    gateId: "attribution",
  },
  {
    pattern: /esm.?import|import.?extension/i,
    failureClass: "preflight",
    gateId: "esm_import_extensions",
  },
  { pattern: /no.?secrets|secret\s*leak/i, failureClass: "preflight", gateId: "no_secrets" },
  {
    pattern: /path.?traversal/i,
    failureClass: "preflight",
    gateId: "path_traversal",
  },
  {
    pattern: /protected.?files/i,
    failureClass: "preflight",
    gateId: "protected_files",
  },
];

/** Extract `FAIL <case_id> (` or regression `id: was pass` from gauntlet stdout. */
export function extractGauntletCaseId(output: string): string | undefined {
  const fail = output.match(/\bFAIL\s+([a-z][a-z0-9_]*)\s*\(/i);
  if (fail?.[1]) return fail[1];
  const regression = output.match(/\b([a-z][a-z0-9_]*):\s*was pass,/i);
  return regression?.[1];
}

export function classifyPreflightOutput(stdout: string): DiagnosticClassification {
  const checks = parsePreflightChecks(stdout);
  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) {
    return {
      failureClass: "unknown",
      summary: "preflight passed",
      checks,
    };
  }

  const primary = failed[0]!;
  let failureClass: DiagnosticClassification["failureClass"] = "preflight";

  if (primary.name.includes("replay")) failureClass = "replay";
  else if (primary.name.includes("capsule")) failureClass = "capsule";
  else if (primary.name.includes("gauntlet")) failureClass = "gauntlet";
  else if (primary.name.includes("bond")) failureClass = "bond";

  const detailBlob = failed.map((c) => c.detail ?? "").join("\n");
  const gauntletCaseId =
    failureClass === "gauntlet" ? extractGauntletCaseId(detailBlob) : undefined;
  const baseSummary = `${primary.name}: ${primary.detail ?? "failed"}`;

  return {
    failureClass,
    gateId: inferGateId(primary),
    gauntletCaseId,
    summary: gauntletCaseId
      ? `${baseSummary} (gauntlet case: ${gauntletCaseId})`
      : baseSummary,
    checks,
  };
}

export function classifyReadinessOutput(stdout: string): DiagnosticClassification {
  const lines = stdout.split("\n").filter(Boolean);
  const checks: DiagnosticCheck[] = lines.map((line) => {
    const fail = line.includes("FAIL") || line.includes("✗");
    const ok = line.includes("ok") || line.includes("✓") || !fail;
    const name = line.replace(/^\[[^\]]+\]\s*/, "").split(":")[0] ?? line;
    return { name, ok, detail: line };
  });

  const failed = checks.filter((c) => !c.ok);
  return {
    failureClass: "readiness",
    summary: failed[0]?.detail ?? "readiness check failed",
    checks,
    gateId: failed[0]?.name.includes("gauntlet") ? "bond_compliance" : undefined,
  };
}

export function classifyReplayOutput(stdout: string, ok: boolean): DiagnosticClassification {
  return {
    failureClass: "replay",
    summary: ok ? "replay passed" : parseReplayReason(stdout),
    gateId: ok ? undefined : "replay_mismatch",
    checks: [{ name: "replay.deterministic", ok, detail: stdout.slice(0, 300) }],
  };
}

export function classifyFromSymptom(symptom: string): DiagnosticClassification {
  if (REPLAY_PATTERNS.test(symptom)) {
    return {
      failureClass: "replay",
      gateId: "replay_mismatch",
      summary: symptom,
      checks: [],
    };
  }
  if (CAPSULE_PATTERNS.test(symptom)) {
    return {
      failureClass: "capsule",
      gateId: "capsule_integrity",
      summary: symptom,
      checks: [],
    };
  }
  if (GAUNTLET_PATTERNS.test(symptom)) {
    const gauntletCaseId = extractGauntletCaseId(symptom);
    return {
      failureClass: "gauntlet",
      gateId: "bond_compliance",
      gauntletCaseId,
      summary: gauntletCaseId
        ? `${symptom} (gauntlet case: ${gauntletCaseId})`
        : symptom,
      checks: [],
    };
  }
  if (BOND_PATTERNS.test(symptom)) {
    return {
      failureClass: "bond",
      gateId: "bond_compliance",
      summary: symptom,
      checks: [],
    };
  }
  if (READINESS_PATTERNS.test(symptom)) {
    return {
      failureClass: "readiness",
      summary: symptom,
      checks: [],
    };
  }
  if (PROMOTION_PATTERNS.test(symptom)) {
    return {
      failureClass: "preflight",
      gateId: "promotion_gate",
      summary: symptom,
      checks: [],
    };
  }
  for (const row of GATE_SYMPTOM_TABLE) {
    if (row.pattern.test(symptom)) {
      return {
        failureClass: row.failureClass,
        gateId: row.gateId,
        summary: symptom,
        checks: [],
      };
    }
  }
  return { failureClass: "unknown", summary: symptom, checks: [] };
}

/**
 * Map CI / GitHub check names into TroubleshootPacket fields for CLI use.
 * Covers Vibe Promotion Gate, Assisted-by attribution, and npm check strings.
 */
export function packetFieldsFromFailedCheck(checkName: string): {
  symptom: string;
  title: string;
  gateId?: string;
  failureClass: DiagnosticClassification["failureClass"];
} {
  const name = checkName.trim() || "unknown check";

  if (PROMOTION_PATTERNS.test(name)) {
    return {
      symptom: `${name} failing`,
      title: name,
      gateId: "promotion_gate",
      failureClass: "preflight",
    };
  }
  if (ATTRIBUTION_CHECK_PATTERNS.test(name)) {
    return {
      symptom: `${name} failing`,
      title: name,
      gateId: "attribution",
      failureClass: "preflight",
    };
  }
  if (NPM_CHECK_PATTERNS.test(name)) {
    return {
      symptom: `npm check failing (${name})`,
      title: name,
      gateId: "npm_check",
      failureClass: "preflight",
    };
  }

  const classified = classifyFromSymptom(name);
  return {
    symptom: name,
    title: name,
    gateId: classified.gateId,
    failureClass: classified.failureClass,
  };
}

/** Build a TroubleshootPacket from a failed CI/check name for `orchestrate troubleshoot`. */
export function packetFromFailedCheck(
  checkName: string,
  options: {
    trustTier?: TroubleshootPacket["trustTier"];
    rootDir?: string;
    body?: string;
    runId?: string;
  } = {},
): TroubleshootPacket {
  const fields = packetFieldsFromFailedCheck(checkName);
  return {
    symptom: fields.symptom,
    title: fields.title,
    gateId: fields.gateId,
    body: options.body,
    runId: options.runId,
    rootDir: options.rootDir,
    trustTier: options.trustTier ?? "experiment",
  };
}

function parsePreflightChecks(stdout: string): DiagnosticCheck[] {
  return stdout
    .split("\n")
    .filter((line) => line.startsWith("[ok]") || line.startsWith("[FAIL]"))
    .map((line) => {
      const ok = line.startsWith("[ok]");
      const rest = line.replace(/^\[(ok|FAIL)\]\s*/, "");
      const colon = rest.indexOf(":");
      if (colon === -1) return { name: rest, ok };
      return {
        name: rest.slice(0, colon),
        ok,
        detail: rest.slice(colon + 1).trim(),
      };
    });
}

function parseReplayReason(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as { reason?: string };
    return parsed.reason ?? "replay mismatch";
  } catch {
    return stdout.slice(0, 200) || "replay mismatch";
  }
}

function inferGateId(check: DiagnosticCheck): string | undefined {
  const text = `${check.name} ${check.detail ?? ""}`.toLowerCase();
  if (text.includes("replay")) return "replay_mismatch";
  if (text.includes("capsule") || text.includes("vows")) return "capsule_integrity";
  if (text.includes("gauntlet") || text.includes("bond")) return "bond_compliance";
  if (text.includes("typescript") || text.includes("tsc")) return "typescript_compiler";
  if (text.includes("vitest") || text.includes("test")) return "vitest";
  return undefined;
}
