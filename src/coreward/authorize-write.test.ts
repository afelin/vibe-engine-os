import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  authorizeWrite,
  clearAuthorizeTicketBindings,
  getAuthorizeTicketBinding,
  preferGateForPaths,
  validateAuthorizeTicket,
} from "./authorize-write.js";
import {
  assertCorewardMode,
  isCorewardMode,
  writeCorewardModeConfig,
} from "./mode.js";
import { readCorewardPresence } from "./presence.js";
import { listReleaseGateIds } from "../release-gate/registry.js";
import {
  generateEd25519KeyPairRaw,
  signMandate,
  verifyOnce,
  writeActiveMandate,
  assertWard,
  clearVerifyCache,
} from "../ward/index.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coreward-aw-"));
}

describe("authorize_write", () => {
  afterEach(() => {
    delete process.env.COREWARD_AUTHORIZE_TICKET;
    delete process.env.VIBE_WARD_STRICT;
    clearAuthorizeTicketBindings();
    clearVerifyCache();
  });

  it("mints a ticket for safe paths and prefers a covering gate", () => {
    const root = tmpRoot();
    try {
      const result = authorizeWrite({
        root_dir: root,
        proposed_files: [
          "src/gate-add-unit-test.ts",
          "src/gate-add-unit-test.test.ts",
        ],
        title: "gate:add-unit-test",
        body: "",
      });
      expect(result.ok).toBe(true);
      expect(result.ticket_id).toMatch(/^aw_/);
      expect(result.prefer_gate).toBe("add-unit-test");
      expect(result.reason).toContain("prefer_gate");
      expect(process.env.COREWARD_AUTHORIZE_TICKET).toBe(result.ticket_id);
      const presence = readCorewardPresence(root);
      expect(presence?.ticket_id).toBe(result.ticket_id);

      const validated = validateAuthorizeTicket(
        root,
        result.ticket_id!,
        result.paths,
      );
      expect(validated.ok).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("same-path refresh reuses ticket id and extends TTL", () => {
    const root = tmpRoot();
    try {
      const first = authorizeWrite({
        root_dir: root,
        proposed_files: ["src/ok.ts"],
        ttl_ms: 60_000,
      });
      expect(first.ok).toBe(true);
      const second = authorizeWrite({
        root_dir: root,
        proposed_files: ["src/ok.ts"],
        ttl_ms: 120_000,
      });
      expect(second.ok).toBe(true);
      expect(second.refreshed).toBe(true);
      expect(second.ticket_id).toBe(first.ticket_id);
      expect(second.reason).toContain("refreshed");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed on house forbidden prefixes", () => {
    const root = tmpRoot();
    try {
      fs.mkdirSync(path.join(root, "src/policy"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "src/policy/mandates.json"),
        JSON.stringify({
          forbidden_prefixes: ["src/auth/"],
          require_approval_prefixes: [],
          max_attempts: 3,
        }),
        "utf8",
      );
      const result = authorizeWrite({
        root_dir: root,
        proposed_files: ["src/auth/session.ts"],
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("house_forbidden");
      expect(result.code).toBe("house_forbidden");
      expect(result.next).toBeTruthy();
      expect(result.ticket_id).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not mint Coreward Mode tickets for approval-prefix paths", () => {
    const root = tmpRoot();
    try {
      fs.mkdirSync(path.join(root, "src/policy"), { recursive: true });
      fs.copyFileSync(
        path.join(process.cwd(), "src/policy/mandates.json"),
        path.join(root, "src/policy/mandates.json"),
      );
      writeCorewardModeConfig(root, { enabled: true });
      delete process.env.COREWARD_AUTHORIZE_TICKET;
      const result = authorizeWrite({
        root_dir: root,
        proposed_files: ["package.json"],
      });
      expect(result.ok).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.reason).toContain("needs_approval");
      expect(result.ticket_id).toBeUndefined();
      const mode = assertCorewardMode(root, "codegen", {
        paths: ["package.json"],
        ticket_id: result.ticket_id,
      });
      expect(mode.ok).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires matching actor when ticket was minted with actor", () => {
    const root = tmpRoot();
    try {
      writeCorewardModeConfig(root, { enabled: true });
      const minted = authorizeWrite({
        root_dir: root,
        proposed_files: ["src/ok.ts"],
        actor: "actor-a",
      });
      expect(minted.ok).toBe(true);
      const noActor = assertCorewardMode(root, "codegen", {
        paths: ["src/ok.ts"],
        ticket_id: minted.ticket_id,
      });
      expect(noActor.ok).toBe(false);
      if (!noActor.ok) {
        expect(noActor.reason).toContain("ticket_actor_required");
      }
      const wrong = assertCorewardMode(root, "codegen", {
        paths: ["src/ok.ts"],
        ticket_id: minted.ticket_id,
        actor: "actor-b",
      });
      expect(wrong.ok).toBe(false);
      if (!wrong.ok) {
        expect(wrong.reason).toContain("ticket_actor_mismatch");
      }
      const ok = assertCorewardMode(root, "codegen", {
        paths: ["src/ok.ts"],
        ticket_id: minted.ticket_id,
        actor: "actor-a",
      });
      expect(ok.ok).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds tickets per rootDir (not only process env)", () => {
    const rootA = tmpRoot();
    const rootB = tmpRoot();
    try {
      const a = authorizeWrite({
        root_dir: rootA,
        proposed_files: ["src/a.ts"],
      });
      const b = authorizeWrite({
        root_dir: rootB,
        proposed_files: ["src/b.ts"],
      });
      expect(a.ok && b.ok).toBe(true);
      expect(getAuthorizeTicketBinding(rootA)).toBe(a.ticket_id);
      expect(getAuthorizeTicketBinding(rootB)).toBe(b.ticket_id);
      expect(getAuthorizeTicketBinding(rootA)).not.toBe(
        getAuthorizeTicketBinding(rootB),
      );
    } finally {
      fs.rmSync(rootA, { recursive: true, force: true });
      fs.rmSync(rootB, { recursive: true, force: true });
    }
  });

  it("preferGateForPaths returns null when no gate covers", () => {
    expect(preferGateForPaths(["src/unique-unmatched-path.ts"])).toBeNull();
  });

  it("rejects expired Mandate via verifyOnce (property)", async () => {
    const root = tmpRoot();
    try {
      const keys = await generateEd25519KeyPairRaw();
      fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".vibe", "principals.json"),
        JSON.stringify({
          principals: [
            {
              id: "cursor-bot",
              public_key: keys.publicKey,
              default: true,
              default_path_constraints: ["src/"],
            },
          ],
        }),
        "utf8",
      );
      const now = Date.now();
      const mandate = await signMandate(
        {
          mandate_id: "m-expired-aw",
          issued_at: new Date(now - 2 * 3600_000).toISOString(),
          expires_at: new Date(now - 60_000).toISOString(),
          authorized_actor: "cursor-bot",
          path_constraints: ["src/"],
          actions: ["codegen", "promote"],
          issuer_public_key: keys.publicKey,
        },
        keys.privateKey,
      );
      writeActiveMandate(root, mandate);
      await expect(verifyOnce(mandate, root)).rejects.toThrow(/expired/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("STRICT rejects unknown actor (not in principals)", async () => {
    const root = tmpRoot();
    try {
      const keys = await generateEd25519KeyPairRaw();
      fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".vibe", "principals.json"),
        JSON.stringify({
          principals: [
            {
              id: "known-bot",
              public_key: keys.publicKey,
              default: true,
              default_path_constraints: ["src/"],
            },
          ],
        }),
        "utf8",
      );
      const now = Date.now();
      const mandate = await signMandate(
        {
          mandate_id: "m-unknown",
          issued_at: new Date(now).toISOString(),
          expires_at: new Date(now + 8 * 3600_000).toISOString(),
          authorized_actor: "unknown-attacker",
          path_constraints: ["src/"],
          actions: ["codegen", "promote"],
          issuer_public_key: keys.publicKey,
        },
        keys.privateKey,
      );
      clearVerifyCache();
      process.env.VIBE_WARD_STRICT = "1";
      const verified = await verifyOnce(mandate, root);
      const denied = assertWard("promote", undefined, verified, {
        rootDir: root,
        actor: "unknown-attacker",
      });
      expect(denied.ok).toBe(false);
      expect(denied.decision.reason).toMatch(/unknown_actor_strict/);
    } finally {
      delete process.env.VIBE_WARD_STRICT;
      clearVerifyCache();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Coreward Mode", () => {
  afterEach(() => {
    delete process.env.COREWARD_AUTHORIZE_TICKET;
  });

  it("fail-closes engine path without ticket or mandate when enabled", () => {
    const root = tmpRoot();
    try {
      delete process.env.COREWARD_AUTHORIZE_TICKET;
      writeCorewardModeConfig(root, { enabled: true });
      expect(isCorewardMode(root)).toBe(true);
      const denied = assertCorewardMode(root, "codegen", {
        paths: ["src/foo.ts"],
      });
      expect(denied.ok).toBe(false);
      expect(denied.ok === false && denied.reason).toContain("missing_ticket");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows engine path with a valid authorize_write ticket", () => {
    const root = tmpRoot();
    try {
      writeCorewardModeConfig(root, { enabled: true });
      const auth = authorizeWrite({
        root_dir: root,
        proposed_files: ["src/ok.ts"],
      });
      expect(auth.ok).toBe(true);
      const allowed = assertCorewardMode(root, "patch", {
        paths: ["src/ok.ts"],
        ticket_id: auth.ticket_id,
      });
      expect(allowed).toEqual({ ok: true, via: "ticket" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("is off by default", () => {
    const root = tmpRoot();
    try {
      expect(isCorewardMode(root)).toBe(false);
      expect(assertCorewardMode(root, "promote", {})).toEqual({
        ok: true,
        via: "mode_off",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("gate catalog size", () => {
  it("ships at least 12 zero-token gates", () => {
    expect(listReleaseGateIds().length).toBeGreaterThanOrEqual(12);
  });
});
