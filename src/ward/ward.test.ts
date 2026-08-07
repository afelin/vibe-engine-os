import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveContextFiles } from "../context/bundle.js";
import type { ExecutionDag } from "../os/events.js";
import { evaluateTaskBond } from "../bond/evaluate.js";
import { appendOsEvent, initializeEventLedger } from "../os/replay.js";
import {
  assertPromoteWard,
  assertWard,
  clearActiveMandate,
  clearVerifyCache,
  generateEd25519KeyPairRaw,
  loadActiveMandate,
  pathFilter,
  readWardDecisions,
  signMandate,
  verifyOnce,
  writeActiveMandate,
  writeWardRunState,
  type SignedMandate,
} from "./index.js";

describe("Mandate–Ward", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    clearVerifyCache();
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ward-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "policy"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "policy", "mandates.json"),
      JSON.stringify({
        forbidden_prefixes: ["src/auth/", ".github/workflows/"],
        require_approval_prefixes: [".github/", "package.json"],
        max_attempts: 3,
        approved_operators: [],
      }),
      "utf8",
    );
    return root;
  }

  async function issueFixture(
    root: string,
    overrides?: Partial<Omit<SignedMandate, "signature" | "issuer_public_key">>,
  ): Promise<{ mandate: SignedMandate; publicKey: string; privateKey: string }> {
    const keys = await generateEd25519KeyPairRaw();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [{ id: "test", public_key: keys.publicKey }],
      }),
      "utf8",
    );
    const now = Date.now();
    const unsigned = {
      mandate_id: overrides?.mandate_id ?? "m-test",
      issued_at: overrides?.issued_at ?? new Date(now).toISOString(),
      expires_at:
        overrides?.expires_at ?? new Date(now + 8 * 3600_000).toISOString(),
      authorized_actor: overrides?.authorized_actor ?? "*",
      path_constraints: overrides?.path_constraints ?? ["src/ward/"],
      actions: overrides?.actions ?? [
        "bond.seal",
        "codegen",
        "patch.apply",
        "promote",
      ],
      max_depth: overrides?.max_depth,
      issuer_public_key: keys.publicKey,
    };
    const mandate = await signMandate(unsigned, keys.privateKey);
    writeActiveMandate(root, mandate);
    return { mandate, ...keys };
  }

  it("no Mandate file ⇒ loadActiveMandate null (legacy compat)", () => {
    const root = makeRoot();
    expect(loadActiveMandate(root)).toBeNull();
  });

  it("pathFilter shrinks to constraints", () => {
    expect(
      pathFilter(
        ["src/ward/index.ts", "src/os/run.ts", "tests/x.ts"],
        ["src/ward/"],
      ),
    ).toEqual(["src/ward/index.ts"]);
  });

  it("resolveContextFiles unchanged without Mandate; shrinks when verified", async () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, "src", "a.ts"), "a", "utf8");
    fs.mkdirSync(path.join(root, "src", "ward"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "ward", "b.ts"), "b", "utf8");

    const dag: ExecutionDag = {
      issueNumber: "1",
      title: "t",
      nodes: [
        {
          id: "e",
          title: "e",
          kind: "edit",
          dependsOn: [],
          risk: "low",
          files: ["src/a.ts", "src/ward/b.ts"],
          acceptance: ["ok"],
        },
      ],
    };

    const legacy = resolveContextFiles(root, dag, ["src/a.ts", "src/ward/b.ts"]);
    expect(legacy).toContain("src/a.ts");
    expect(legacy).toContain("src/ward/b.ts");

    const { mandate } = await issueFixture(root, {
      path_constraints: ["src/ward/"],
    });
    const verified = await verifyOnce(mandate, root);
    const shrunk = resolveContextFiles(root, dag, ["src/a.ts", "src/ward/b.ts"], {
      verifiedMandate: verified,
    });
    expect(shrunk).toEqual(["src/ward/b.ts"]);
    expect(shrunk.join("").length).toBeLessThan(legacy.join("").length);
  });

  it("verifyOnce rejects forged signature and expired mandate", async () => {
    const root = makeRoot();
    const { mandate } = await issueFixture(root);
    const forged: SignedMandate = {
      ...mandate,
      signature: mandate.signature.replace(/A/g, "B").padEnd(mandate.signature.length, "x"),
    };
    // ensure different
    forged.signature = `${mandate.signature.slice(0, -4)}AAAA`;
    clearVerifyCache();
    await expect(verifyOnce(forged, root)).rejects.toThrow(/signature/);

    clearVerifyCache();
    clearActiveMandate(root);
    const expired = await issueFixture(root, {
      mandate_id: "m-expired",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    clearVerifyCache();
    await expect(verifyOnce(expired.mandate, root)).rejects.toThrow(
      /mandate_expired/,
    );
  });

  it("assertWard DENY outside constraints; ALLOW inside; house AND blocks auth", async () => {
    const root = makeRoot();
    const { mandate } = await issueFixture(root, {
      path_constraints: ["src/ward/", "src/auth/"],
    });
    const verified = await verifyOnce(mandate, root);
    initializeEventLedger(root, "run-1", {
      issueNumber: "1",
      issueTitle: "t",
      issueBody: "",
      attempts: 0,
      maxAttempts: 3,
      findings: [],
      generatedFiles: [],
      verificationResults: [],
      failures: [],
    }, false);

    const denyPath = assertWard("codegen", "src/os/run.ts", verified, {
      rootDir: root,
      runId: "run-1",
    });
    expect(denyPath.ok).toBe(false);
    expect(denyPath.decision.reason).toMatch(/path_outside/);

    const houseDeny = assertWard("codegen", "src/auth/session.ts", verified, {
      rootDir: root,
      runId: "run-1",
    });
    expect(houseDeny.ok).toBe(false);
    expect(houseDeny.decision.reason).toMatch(/house_forbidden/);

    const allow = assertWard("codegen", "src/ward/index.ts", verified, {
      rootDir: root,
      runId: "run-1",
    });
    expect(allow.ok).toBe(true);

    const decisions = readWardDecisions(root, "run-1");
    expect(decisions.some((d) => d.verdict === "DENY")).toBe(true);
    expect(decisions.some((d) => d.verdict === "ALLOW")).toBe(true);
  });

  it("assertWard DENY when expired at call time", async () => {
    const root = makeRoot();
    const { mandate } = await issueFixture(root);
    const verified = await verifyOnce(mandate, root);
    const later = new Date(Date.parse(mandate.expires_at) + 1000);
    const result = assertWard("promote", undefined, verified, { now: later });
    expect(result.ok).toBe(false);
    expect(result.decision.reason).toBe("mandate_expired");
  });

  it("promote fail-closed when ward.json present without ALLOW", async () => {
    const root = makeRoot();
    writeWardRunState(root, "run-p", {
      mandate_id: "m-p",
      verified_at: new Date().toISOString(),
      path_constraints: ["src/"],
      actions: ["promote", "codegen"],
      authorized_actor: "*",
    });
    expect(assertPromoteWard(root, "run-p").ok).toBe(false);

    initializeEventLedger(root, "run-p", {
      issueNumber: "1",
      issueTitle: "t",
      issueBody: "",
      attempts: 0,
      maxAttempts: 3,
      findings: [],
      generatedFiles: [],
      verificationResults: [],
      failures: [],
    }, false);
    appendOsEvent(root, "run-p", {
      type: "ward_decision",
      mandate_id: "m-p",
      action: "promote",
      verdict: "ALLOW",
      reason: "ward_allow",
      at: new Date().toISOString(),
    });
    expect(assertPromoteWard(root, "run-p").ok).toBe(true);
  });

  it("no-mandate bond eval stays legacy", () => {
    const root = makeRoot();
    const evalResult = evaluateTaskBond(
      {
        intent: "Add helper",
        outcomes: ["tests pass"],
        boundFiles: ["src/helper.ts"],
        constraints: [],
      },
      3,
      root,
    );
    expect(evalResult.passed).toBe(true);
  });

  it("bond eval denies paths outside Mandate when loaded", async () => {
    const root = makeRoot();
    const { mandate } = await issueFixture(root, {
      path_constraints: ["src/ward/"],
    });
    const verified = await verifyOnce(mandate, root);
    const evalResult = evaluateTaskBond(
      {
        intent: "Touch os",
        outcomes: ["ok"],
        boundFiles: ["src/os/run.ts"],
        constraints: [],
      },
      3,
      root,
      undefined,
      verified,
    );
    expect(evalResult.passed).toBe(false);
    expect(evalResult.violations.some((v) => v.rule === "ward_path_denied")).toBe(
      true,
    );
  });
});

describe("Option B /approve override", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    clearVerifyCache();
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CI-signed override tags bot principal + override_kind, not the human", async () => {
    const { maybeIssueApprovalOverride } = await import("./approve-override.js");
    const {
      GITHUB_CI_BOT_OVERRIDE,
      OVERRIDE_KIND_GITHUB_COMMENT,
      assertWard,
      generateEd25519KeyPairRaw,
      verifyOnce,
      clearVerifyCache: clear,
    } = await import("./index.js");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ward-ov-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "ward"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "policy"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "policy", "mandates.json"),
      JSON.stringify({
        forbidden_prefixes: ["src/auth/"],
        require_approval_prefixes: [],
        max_attempts: 3,
      }),
      "utf8",
    );

    const keys = await generateEd25519KeyPairRaw();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [{ id: "ci", public_key: keys.publicKey }],
      }),
      "utf8",
    );

    const human = "afelin";
    const result = await maybeIssueApprovalOverride({
      rootDir: root,
      actor: human,
      pathConstraints: ["src/ward/"],
      privateKeyEnv: keys.privateKey,
      publicKeyEnv: keys.publicKey,
    });

    expect(result.issued).toBe(true);
    if (!result.issued) return;

    expect(result.mandate.authorized_actor).toBe(GITHUB_CI_BOT_OVERRIDE);
    expect(result.mandate.authorized_actor).not.toBe(human);
    expect(result.mandate.override_kind).toBe(OVERRIDE_KIND_GITHUB_COMMENT);
    expect(result.mandate.approving_comment_actor).toBe(human);

    clear();
    const verified = await verifyOnce(result.mandate, root);
    const ward = assertWard("promote", undefined, verified, {
      rootDir: root,
      actor: human,
    });
    expect(ward.ok).toBe(true);
    expect(ward.decision.override_kind).toBe(OVERRIDE_KIND_GITHUB_COMMENT);
  });

  it("plain-text /approve stays legacy when no runner key", async () => {
    const { maybeIssueApprovalOverride } = await import("./approve-override.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ward-legacy-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });

    const result = await maybeIssueApprovalOverride({
      rootDir: root,
      actor: "afelin",
      privateKeyEnv: "",
    });
    expect(result.issued).toBe(false);
    if (result.issued) return;
    expect(result.reason).toMatch(/legacy_approve/);
  });
});

describe("AgentId gel — effective budget + STRICT", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    clearVerifyCache();
    delete process.env.VIBE_WARD_STRICT;
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ward-aid-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "policy"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "policy", "mandates.json"),
      JSON.stringify({
        forbidden_prefixes: ["src/auth/"],
        require_approval_prefixes: [],
        max_attempts: 3,
      }),
      "utf8",
    );
    return root;
  }

  it("resolveEffectiveBudget tightens paths; no profile is bit-identical", async () => {
    const { resolveEffectiveBudget } = await import("./index.js");
    const mandate = {
      path_constraints: ["src/", "tests/"],
      max_depth: 4,
      authorized_actor: "bot",
    };
    expect(resolveEffectiveBudget(mandate, null).path_constraints).toEqual([
      "src/",
      "tests/",
    ]);
    const tightened = resolveEffectiveBudget(mandate, {
      agent_id: "bot",
      default_path_constraints: ["src/ward/"],
      max_depth: 2,
      max_context_chars: 4000,
    });
    expect(tightened.path_constraints).toEqual(["src/ward/"]);
    expect(tightened.max_depth).toBe(2);
    expect(tightened.max_context_chars).toBe(4000);
    expect(tightened.agent_id).toBe("bot");
    expect(tightened.profile_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stamps agent_id on ward_decision when profile present", async () => {
    const root = makeRoot();
    const keys = await generateEd25519KeyPairRaw();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [
          {
            id: "cursor-bot",
            public_key: keys.publicKey,
            default: true,
            default_path_constraints: ["src/ward/"],
          },
        ],
      }),
      "utf8",
    );
    const now = Date.now();
    const mandate = await signMandate(
      {
        mandate_id: "m-profile",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 3600_000).toISOString(),
        authorized_actor: "cursor-bot",
        path_constraints: ["src/"],
        actions: ["bond.seal", "codegen", "patch.apply", "promote"],
        issuer_public_key: keys.publicKey,
      },
      keys.privateKey,
    );
    writeActiveMandate(root, mandate);
    const verified = await verifyOnce(mandate, root);
    const result = assertWard("codegen", "src/ward/index.ts", verified, {
      rootDir: root,
      actor: "cursor-bot",
    });
    expect(result.ok).toBe(true);
    expect(result.decision.agent_id).toBe("cursor-bot");
  });

  it("VIBE_WARD_STRICT denies unknown actor without profile", async () => {
    const root = makeRoot();
    const keys = await generateEd25519KeyPairRaw();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [{ id: "issuer", public_key: keys.publicKey }],
      }),
      "utf8",
    );
    const now = Date.now();
    const mandate = await signMandate(
      {
        mandate_id: "m-strict",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 3600_000).toISOString(),
        authorized_actor: "*",
        path_constraints: ["src/"],
        actions: ["promote"],
        issuer_public_key: keys.publicKey,
      },
      keys.privateKey,
    );
    const verified = await verifyOnce(mandate, root);
    process.env.VIBE_WARD_STRICT = "1";
    const denied = assertWard("promote", undefined, verified, {
      rootDir: root,
      actor: "stranger",
    });
    expect(denied.ok).toBe(false);
    expect(denied.decision.reason).toMatch(/unknown_actor_strict/);

    delete process.env.VIBE_WARD_STRICT;
    const allowed = assertWard("promote", undefined, verified, {
      rootDir: root,
      actor: "stranger",
    });
    expect(allowed.ok).toBe(true);
  });

  it("string actor without profile still works when not STRICT", async () => {
    const root = makeRoot();
    const keys = await generateEd25519KeyPairRaw();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [{ id: "issuer", public_key: keys.publicKey }],
      }),
      "utf8",
    );
    const now = Date.now();
    const mandate = await signMandate(
      {
        mandate_id: "m-compat",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 3600_000).toISOString(),
        authorized_actor: "any-github-login",
        path_constraints: ["src/"],
        actions: ["promote"],
        issuer_public_key: keys.publicKey,
      },
      keys.privateKey,
    );
    const verified = await verifyOnce(mandate, root);
    const result = assertWard("promote", undefined, verified, {
      rootDir: root,
      actor: "any-github-login",
    });
    expect(result.ok).toBe(true);
    expect(result.decision.agent_id).toBeUndefined();
  });
});
