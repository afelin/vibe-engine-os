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
