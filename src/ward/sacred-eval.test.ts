/**
 * Sacred Ward eval — prove once, keep forever.
 * Primary: forged ALLOW receipts + fake ward.json without valid Mandate ⇒ promote fails.
 * Secondary: poisoned principals ⇒ engine refuses.
 * Tertiary: STRICT rejects `*`; expiry at promote; override ⊆ actions.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendOsEvent, initializeEventLedger } from "../os/replay.js";
import { writePromotionBundle } from "../run/promotion.js";
import { narrowOverrideActions } from "./approve-override.js";
import {
  assertPromoteWard,
  assertWard,
  clearVerifyCache,
  generateEd25519KeyPairRaw,
  persistRunMandate,
  signMandate,
  verifyOnce,
  writeActiveMandate,
  writeWardRunState,
  type SignedMandate,
} from "./index.js";

describe("sacred Ward eval", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    clearVerifyCache();
    delete process.env.VIBE_WARD_STRICT;
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ward-sacred-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "ward"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "policy"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "policy", "mandates.json"),
      JSON.stringify({
        forbidden_prefixes: [
          "src/auth/",
          "src/policy/mandates.json",
          "src/policy/principals.json",
          ".vibe/principals.json",
          ".vibe/active_mandate.json",
        ],
        require_approval_prefixes: [],
        max_attempts: 3,
      }),
      "utf8",
    );
    return root;
  }

  async function issueValid(
    root: string,
    actor = "cursor-bot",
  ): Promise<{ mandate: SignedMandate; privateKey: string; publicKey: string }> {
    const keys = await generateEd25519KeyPairRaw();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [
          {
            id: actor,
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
        mandate_id: "m-sacred",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 8 * 3600_000).toISOString(),
        authorized_actor: actor,
        path_constraints: ["src/ward/"],
        actions: ["bond.seal", "codegen", "patch.apply", "promote"],
        issuer_public_key: keys.publicKey,
      },
      keys.privateKey,
    );
    writeActiveMandate(root, mandate);
    return { mandate, ...keys };
  }

  it("forged promote ALLOW receipts never authorize (ward_promote_reverify)", async () => {
    const root = makeRoot();
    const runId = "run-forged";
    writeWardRunState(root, runId, {
      mandate_id: "m-forged",
      verified_at: new Date().toISOString(),
      path_constraints: ["src/"],
      actions: ["promote", "codegen"],
      authorized_actor: "attacker",
    });
    initializeEventLedger(
      root,
      runId,
      {
        issueNumber: "1",
        issueTitle: "t",
        issueBody: "",
        attempts: 0,
        maxAttempts: 3,
        findings: [],
        generatedFiles: [],
        verificationResults: [],
        failures: [],
      },
      false,
    );
    appendOsEvent(root, runId, {
      type: "ward_decision",
      mandate_id: "m-forged",
      action: "promote",
      verdict: "ALLOW",
      reason: "forged",
      at: new Date().toISOString(),
    });
    appendOsEvent(root, runId, {
      type: "ward_decision",
      mandate_id: "m-forged",
      action: "codegen",
      verdict: "ALLOW",
      reason: "forged",
      at: new Date().toISOString(),
    });

    const noMandate = await assertPromoteWard(root, runId, {
      actor: "attacker",
      codegenRan: true,
    });
    expect(noMandate.ok).toBe(false);
    expect(noMandate.reason).toMatch(/mandate\.json|receipts never authorize/);

    // Plant fake mandate.json with garbage signature — re-verify must fail.
    fs.writeFileSync(
      path.join(root, ".runs", runId, "mandate.json"),
      JSON.stringify({
        mandate_id: "m-forged",
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        authorized_actor: "attacker",
        path_constraints: ["src/"],
        actions: ["promote", "codegen"],
        issuer_public_key: "not-a-real-key",
        signature: "forged-sig",
      }),
      "utf8",
    );
    clearVerifyCache();
    const forgedSig = await assertPromoteWard(root, runId, {
      actor: "attacker",
    });
    expect(forgedSig.ok).toBe(false);
    expect(forgedSig.reason).toMatch(/re-verify|principals|signature|key/i);
  });

  it("valid Mandate re-verify allows promote; pathFilter + house AND hold", async () => {
    const root = makeRoot();
    const { mandate } = await issueValid(root);
    const runId = "run-ok";
    persistRunMandate(root, runId, mandate);
    writeWardRunState(root, runId, {
      mandate_id: mandate.mandate_id,
      verified_at: new Date().toISOString(),
      path_constraints: ["src/ward/"],
      actions: mandate.actions,
      authorized_actor: mandate.authorized_actor,
      agent_id: "cursor-bot",
    });
    writePromotionBundle(root, runId, [
      { path: "src/ward/ok.ts", content: "export const ok = 1;\n" },
    ]);
    initializeEventLedger(
      root,
      runId,
      {
        issueNumber: "1",
        issueTitle: "t",
        issueBody: "",
        attempts: 0,
        maxAttempts: 3,
        findings: [],
        generatedFiles: [],
        verificationResults: [],
        failures: [],
      },
      false,
    );
    appendOsEvent(root, runId, {
      type: "ward_decision",
      mandate_id: mandate.mandate_id,
      action: "codegen",
      verdict: "ALLOW",
      reason: "ward_allow",
      at: new Date().toISOString(),
    });

    const ok = await assertPromoteWard(root, runId, {
      actor: "cursor-bot",
      codegenRan: true,
    });
    expect(ok.ok).toBe(true);

    // Bundle path outside constraints ⇒ DENY
    writePromotionBundle(root, runId, [
      { path: "src/os/evil.ts", content: "export const evil = 1;\n" },
    ]);
    const denied = await assertPromoteWard(root, runId, {
      actor: "cursor-bot",
    });
    expect(denied.ok).toBe(false);
    expect(denied.reason).toMatch(/pathFilter|path_outside|house_forbidden/);
  });

  it("poisoned principals refuse verify / promote (gauntlet)", async () => {
    const root = makeRoot();
    const { mandate } = await issueValid(root);
    // Poison trust file after issue.
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [
          {
            id: "cursor-bot",
            public_key: "poisoned-not-the-issuer-key",
            default: true,
            default_path_constraints: ["src/ward/"],
          },
        ],
      }),
      "utf8",
    );
    clearVerifyCache();
    await expect(verifyOnce(mandate, root)).rejects.toThrow(/principals|trust/i);

    const runId = "run-poison";
    persistRunMandate(root, runId, mandate);
    writeWardRunState(root, runId, {
      mandate_id: mandate.mandate_id,
      verified_at: new Date().toISOString(),
      path_constraints: ["src/ward/"],
      actions: mandate.actions,
      authorized_actor: mandate.authorized_actor,
    });
    const promote = await assertPromoteWard(root, runId, {
      actor: "cursor-bot",
    });
    expect(promote.ok).toBe(false);
    expect(promote.reason).toMatch(/re-verify|principals|trust/i);
  });

  it("STRICT rejects *; expiry at promote; override ⊆ actions (ward_strict_ci / ward_no_star_strict)", async () => {
    const root = makeRoot();
    const keys = await generateEd25519KeyPairRaw();
    fs.writeFileSync(
      path.join(root, ".vibe", "principals.json"),
      JSON.stringify({
        principals: [
          {
            id: "issuer",
            public_key: keys.publicKey,
            default: true,
            default_path_constraints: ["src/"],
          },
        ],
      }),
      "utf8",
    );
    const now = Date.now();
    const star = await signMandate(
      {
        mandate_id: "m-star",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 3600_000).toISOString(),
        authorized_actor: "*",
        path_constraints: ["src/"],
        actions: ["promote"],
        issuer_public_key: keys.publicKey,
      },
      keys.privateKey,
    );
    process.env.VIBE_WARD_STRICT = "1";
    const verified = await verifyOnce(star, root);
    const denied = assertWard("promote", undefined, verified, {
      rootDir: root,
      actor: "issuer",
    });
    expect(denied.ok).toBe(false);
    expect(denied.decision.reason).toBe("wildcard_actor_strict");

    const expired = await signMandate(
      {
        mandate_id: "m-exp",
        issued_at: new Date(now - 7200_000).toISOString(),
        expires_at: new Date(now - 60_000).toISOString(),
        authorized_actor: "issuer",
        path_constraints: ["src/"],
        actions: ["promote"],
        issuer_public_key: keys.publicKey,
      },
      keys.privateKey,
    );
    clearVerifyCache();
    // verifyOnce rejects expired at load — plant past-expiry for promote path via persist after skip.
    // Use a still-valid mandate then advance `now` at promote.
    const soon = await signMandate(
      {
        mandate_id: "m-soon",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        authorized_actor: "issuer",
        path_constraints: ["src/"],
        actions: ["promote"],
        issuer_public_key: keys.publicKey,
      },
      keys.privateKey,
    );
    clearVerifyCache();
    const runId = "run-exp";
    persistRunMandate(root, runId, soon);
    writeWardRunState(root, runId, {
      mandate_id: soon.mandate_id,
      verified_at: new Date().toISOString(),
      path_constraints: ["src/"],
      actions: ["promote"],
      authorized_actor: "issuer",
    });
    delete process.env.VIBE_WARD_STRICT;
    const late = await assertPromoteWard(root, runId, {
      actor: "issuer",
      now: new Date(Date.parse(soon.expires_at) + 5_000),
    });
    expect(late.ok).toBe(false);
    expect(late.reason).toMatch(/expired|re-verify/i);

    // override ⊆ base actions — never widen to full WARD_ACTIONS when base is narrow.
    expect(narrowOverrideActions(["codegen"])).toEqual(["codegen"]);
    expect(narrowOverrideActions(["promote", "codegen"])).toEqual([
      "codegen",
      "promote",
    ]);
    expect(narrowOverrideActions(undefined).includes("bond.seal")).toBe(false);

    // silence unused
    expect(expired.mandate_id).toBe("m-exp");
  });

  it("house forbids trust-file edits", async () => {
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
            default_path_constraints: ["src/", ".vibe/"],
          },
        ],
      }),
      "utf8",
    );
    const now = Date.now();
    const mandate = await signMandate(
      {
        mandate_id: "m-trust",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 3600_000).toISOString(),
        authorized_actor: "cursor-bot",
        path_constraints: ["src/", ".vibe/"],
        actions: ["codegen"],
        issuer_public_key: keys.publicKey,
      },
      keys.privateKey,
    );
    const verified = await verifyOnce(mandate, root);
    const houseDeny = assertWard("codegen", ".vibe/principals.json", verified, {
      rootDir: root,
      actor: "cursor-bot",
    });
    expect(houseDeny.ok).toBe(false);
    expect(houseDeny.decision.reason).toMatch(/house_forbidden/);
  });
});
