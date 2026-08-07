/**
 * Prelaunch claim ledger — every marketing claim maps to an assert ID.
 * Claims with assert: null stay unclaimed (never pass) until the product exists.
 * CI / scar / docs may only quote claims with status "pass".
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type ClaimStatus = "pass" | "fail" | "unclaimed";
export type BatteryMode = "fast" | "full" | "cloud";
export type KillerStatus = "pass" | "fail" | "soft" | "skip";

export type ClaimDefinition = {
  id: string;
  text: string;
  /** Assert key in assertResults. null = permanently unclaimed until product ships. */
  assert: string | null;
};

export type ClaimEntry = ClaimDefinition & {
  status: ClaimStatus;
};

export type AssertResults = Record<string, boolean | undefined>;

export type KillerMap = Record<string, KillerStatus>;

export type FunnelSignals = {
  bootstrapMs?: number;
  goGuideActions?: number;
  [key: string]: number | string | boolean | undefined;
};

export type BatteryReport = {
  mode: BatteryMode;
  elapsedMs: number;
  claims: ClaimEntry[];
  killers: KillerMap;
  funnel: FunnelSignals;
};

/** Claim IDs that must never report pass (paid stubs / not built yet). */
export const UNCLAIMABLE_IDS = Object.freeze([
  "hosted_hpurl",
  "cyberready_live",
  "ide_ward_interceptor",
] as const);

export type UnclaimableId = (typeof UNCLAIMABLE_IDS)[number];

/**
 * Canonical claim → assert map. hosted_hpurl and cyberready_live keep assert null.
 */
export const CLAIM_CATALOG: readonly ClaimDefinition[] = Object.freeze([
  {
    id: "zero_token_happy_path",
    text: "Templated happy path ships without LLM keys",
    assert: "orchestrate_smoke_or_activate_no_llm",
  },
  {
    id: "gauntlet_blocks_forbidden",
    text: "Forbidden paths are rejected",
    assert: "eval_bond",
  },
  {
    id: "go_three_actions",
    text: "/go returns exactly three next actions",
    assert: "battery_moments",
  },
  {
    id: "trust_summary_markers",
    text: "Trust summary block is present and marked",
    assert: "battery_moments",
  },
  {
    id: "stackables_mcp_roundtrip",
    text: "Legal-space stackables round-trip via MCP",
    assert: "mcp_stackables_smoke",
  },
  {
    id: "cyberready_fail_open",
    text: "CyberReady bridge fail-opens with not_installed",
    assert: "cyberready_soft",
  },
  {
    id: "hpurl_space_param",
    text: "HPURL space= legal-space param round-trips",
    assert: "battery_moments",
  },
  {
    id: "stakeholder_narratives",
    text: "Stakeholder narratives emit ops/compliance/investor keywords",
    assert: "battery_moments",
  },
  {
    id: "check_once",
    text: "Typecheck + unit tests green (check once, no activate double-run)",
    assert: "check",
  },
  {
    id: "launch_readiness",
    text: "Launch readiness gates pass",
    assert: "launch_readiness",
  },
  {
    id: "metrics_check",
    text: "Metrics check passes",
    assert: "metrics_check",
  },
  {
    id: "launch_ship_dry",
    text: "launch:ship --dry-run preflight passes",
    assert: "launch_ship_dry",
  },
  {
    id: "redteam_gauntlet",
    text: "Adversarial redteam gauntlet passes",
    assert: "redteam",
  },
  {
    id: "cloud_launch_proof",
    text: "Cloud launch-proof E2E recorded",
    assert: "launch_proof",
  },
  {
    id: "hosted_hpurl",
    text: "Hosted receipt verify",
    assert: null,
  },
  {
    id: "cyberready_live",
    text: "CyberReady-ready signed proof for buyers",
    assert: null,
  },
  {
    id: "ide_ward_interceptor",
    text: "IDE host interceptor for Ward",
    assert: null,
  },
  {
    id: "ward_promote_reverify",
    text: "Forged promote receipts cannot authorize; promote re-verifies Mandate live",
    assert: "ward_sacred",
  },
  {
    id: "ward_strict_ci",
    text: "Regulated CI sets VIBE_WARD_STRICT; STRICT rejects wildcard actors",
    assert: "ward_sacred",
  },
  {
    id: "ward_no_star_strict",
    text: "Issue never invents *; STRICT denies authorized_actor=*",
    assert: "ward_sacred",
  },
]);

const UNCLAIMABLE_SET = new Set<string>(UNCLAIMABLE_IDS);

export function isUnclaimable(id: string): boolean {
  return UNCLAIMABLE_SET.has(id);
}

/**
 * Evaluate one claim against assert results.
 * - assert null or unclaimable id → always unclaimed (never pass)
 * - assert key absent → unclaimed (not run in this mode)
 * - assert present + true → pass
 * - assert present + false → fail
 */
export function evaluateClaim(
  def: ClaimDefinition,
  assertResults: AssertResults,
): ClaimEntry {
  if (def.assert === null || isUnclaimable(def.id)) {
    return {
      id: def.id,
      text: def.text,
      assert: null,
      status: "unclaimed",
    };
  }

  if (!Object.prototype.hasOwnProperty.call(assertResults, def.assert)) {
    return { ...def, status: "unclaimed" };
  }

  const result = assertResults[def.assert];
  if (result === true) {
    return { ...def, status: "pass" };
  }
  return { ...def, status: "fail" };
}

/** Build claim entries from the catalog + assert results. */
export function evaluateAssertResults(
  assertResults: AssertResults,
  catalog: readonly ClaimDefinition[] = CLAIM_CATALOG,
): ClaimEntry[] {
  return catalog.map((def) => evaluateClaim(def, assertResults));
}

/** Claims safe to quote in GTM / scar copy. */
export function quotableClaims(claims: ClaimEntry[]): ClaimEntry[] {
  return claims.filter((c) => c.status === "pass");
}

/** True when any claim that should have evidence failed. */
export function hasFailedClaims(claims: ClaimEntry[]): boolean {
  return claims.some((c) => c.status === "fail");
}

/**
 * Hard rule: hosted_hpurl and cyberready_live must remain unclaimed.
 * Returns false if either is pass or has a non-null assert with pass status.
 */
export function unclaimableStayUnclaimed(claims: ClaimEntry[]): boolean {
  for (const id of UNCLAIMABLE_IDS) {
    const entry = claims.find((c) => c.id === id);
    if (!entry) return false;
    if (entry.status !== "unclaimed") return false;
    if (entry.assert !== null) return false;
  }
  return true;
}

export const KILLER_IDS = [
  "K1",
  "K2",
  "K3",
  "K4",
  "K5",
  "K6",
  "K7",
  "K8",
  "K9",
  "K10",
  "K11",
  "K12",
  "K13",
  "K14",
] as const;

export type KillerId = (typeof KILLER_IDS)[number];

/**
 * Map battery assert keys → killer feature statuses (K1–K14).
 * Soft CyberReady → soft; missing optional steps → skip.
 */
export function buildKillers(assertResults: AssertResults): KillerMap {
  const status = (
    key: string,
    opts?: { soft?: boolean; optional?: boolean },
  ): KillerStatus => {
    const v = assertResults[key];
    if (v === true) return opts?.soft ? "soft" : "pass";
    if (v === false) return "fail";
    return opts?.optional ? "skip" : "fail";
  };

  return {
    K1: status("eval_bond"),
    K2: status("launch_proof", { optional: true }),
    K3: status("orchestrate_smoke_or_activate_no_llm", { optional: true }),
    K4: status("launch_proof", { optional: true }),
    K5: status("eval_bond"),
    K6: status("mcp_stackables_smoke"),
    K7: status("check", { optional: true }),
    K8: status("battery_moments"),
    K9: status("orchestrate_smoke_or_activate_no_llm", { optional: true }),
    K10: status("mcp_stackables_smoke"),
    K11: status("check", { optional: true }),
    K12: status("battery_moments"),
    K13: status("cyberready_soft", { soft: true }),
    K14: status("battery_moments"),
  };
}

export type BuildBatteryReportInput = {
  mode: BatteryMode;
  elapsedMs: number;
  assertResults: AssertResults;
  funnel?: FunnelSignals;
  catalog?: readonly ClaimDefinition[];
};

/** Assemble the full battery scoreboard object. */
export function buildBatteryReport(input: BuildBatteryReportInput): BatteryReport {
  const claims = evaluateAssertResults(
    input.assertResults,
    input.catalog ?? CLAIM_CATALOG,
  );
  return {
    mode: input.mode,
    elapsedMs: input.elapsedMs,
    claims,
    killers: buildKillers(input.assertResults),
    funnel: {
      goGuideActions: 3,
      ...input.funnel,
    },
  };
}

export const DEFAULT_BATTERY_REPORT_REL = ".vibe/battery-prelaunch.json";

/** Write battery report JSON; returns absolute path written. */
export function writeBatteryReport(
  rootDir: string,
  report: BatteryReport,
  relativePath = DEFAULT_BATTERY_REPORT_REL,
): string {
  const outPath = path.resolve(rootDir, relativePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outPath;
}

/** Build + write in one step. */
export function buildAndWriteBatteryReport(
  rootDir: string,
  input: BuildBatteryReportInput,
  relativePath = DEFAULT_BATTERY_REPORT_REL,
): { report: BatteryReport; path: string } {
  const report = buildBatteryReport(input);
  const written = writeBatteryReport(rootDir, report, relativePath);
  return { report, path: written };
}

/** Parse assert results from a JSON string (shell → ledger bridge). */
export function parseAssertResultsJson(raw: string): AssertResults {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("assertResults must be a JSON object");
  }
  const out: AssertResults = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === true || value === false) {
      out[key] = value;
    } else if (value === null || value === undefined) {
      out[key] = undefined;
    } else if (value === "pass" || value === "true") {
      out[key] = true;
    } else if (value === "fail" || value === "false") {
      out[key] = false;
    }
  }
  return out;
}

function parseCliArgs(argv: string[]): {
  write: boolean;
  mode: BatteryMode;
  elapsedMs: number;
  assertsRaw: string;
  rootDir: string;
  funnelRaw: string;
} {
  let write = false;
  let mode: BatteryMode = "fast";
  let elapsedMs = 0;
  let assertsRaw = "{}";
  let rootDir = ".";
  let funnelRaw = "{}";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") write = true;
    else if (a === "--mode") mode = argv[++i] as BatteryMode;
    else if (a === "--elapsed") elapsedMs = Number(argv[++i] ?? 0);
    else if (a === "--asserts") assertsRaw = argv[++i] ?? "{}";
    else if (a === "--asserts-file") {
      assertsRaw = fs.readFileSync(argv[++i] ?? "", "utf8");
    } else if (a === "--root") rootDir = argv[++i] ?? ".";
    else if (a === "--funnel") funnelRaw = argv[++i] ?? "{}";
  }
  return { write, mode, elapsedMs, assertsRaw, rootDir, funnelRaw };
}

/** CLI: `npx tsx src/launch/claim-ledger.ts --write --mode fast --elapsed N --asserts-file path` */
const invokedAsCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /claim-ledger\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"));

if (invokedAsCli) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.write) {
    process.stderr.write(
      "usage: claim-ledger.ts --write --mode fast|full|cloud --elapsed <ms> --asserts-file <path>\n",
    );
    process.exit(2);
  }
  const assertResults = parseAssertResultsJson(args.assertsRaw);
  const funnel = JSON.parse(args.funnelRaw) as FunnelSignals;
  const { report, path: outPath } = buildAndWriteBatteryReport(args.rootDir, {
    mode: args.mode,
    elapsedMs: args.elapsedMs,
    assertResults,
    funnel,
  });
  process.stdout.write(`${outPath}\n`);
  if (!unclaimableStayUnclaimed(report.claims)) {
    process.stderr.write(
      "claim-ledger: hosted_hpurl / cyberready_live must stay unclaimed\n",
    );
    process.exit(1);
  }
  const failed = report.claims.filter((c) => c.status === "fail");
  if (failed.length > 0) {
    process.stderr.write(
      `claim-ledger: ${failed.length} claim(s) failed: ${failed.map((c) => c.id).join(", ")}\n`,
    );
  }
  const passed = report.claims.filter((c) => c.status === "pass").length;
  const unclaimed = report.claims.filter((c) => c.status === "unclaimed").length;
  process.stdout.write(
    `claim-ledger: ${passed} pass, ${failed.length} fail, ${unclaimed} unclaimed\n`,
  );
}
