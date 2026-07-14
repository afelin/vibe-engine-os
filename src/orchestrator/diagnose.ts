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
  summary: string;
  checks: DiagnosticCheck[];
};

const REPLAY_PATTERNS = /replay|deterministic|snapshot mismatch|events\.ndjson/i;
const CAPSULE_PATTERNS = /capsule|vows|manifest/i;
const GAUNTLET_PATTERNS = /gauntlet|taskbond/i;
const BOND_PATTERNS = /bond|bound.?file/i;
const READINESS_PATTERNS = /readiness|workflow|proof page|launch/i;

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

  return {
    failureClass,
    gateId: inferGateId(primary),
    summary: `${primary.name}: ${primary.detail ?? "failed"}`,
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
    return {
      failureClass: "gauntlet",
      gateId: "bond_compliance",
      summary: symptom,
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
  return { failureClass: "unknown", summary: symptom, checks: [] };
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
