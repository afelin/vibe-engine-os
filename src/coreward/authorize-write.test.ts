import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  authorizeWrite,
  preferGateForPaths,
  validateAuthorizeTicket,
} from "./authorize-write.js";
import {
  assertCorewardMode,
  isCorewardMode,
  writeCorewardModeConfig,
} from "./mode.js";
import { listReleaseGateIds } from "../release-gate/registry.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coreward-aw-"));
}

describe("authorize_write", () => {
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
      expect(result.ticket_id).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("preferGateForPaths returns null when no gate covers", () => {
    expect(preferGateForPaths(["src/unique-unmatched-path.ts"])).toBeNull();
  });
});

describe("Coreward Mode", () => {
  it("fail-closes engine path without ticket or mandate when enabled", () => {
    const root = tmpRoot();
    try {
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
