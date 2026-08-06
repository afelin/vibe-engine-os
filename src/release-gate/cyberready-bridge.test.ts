import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cyberreadyValidateDelta } from "./cyberready-bridge.js";

describe("cyberreadyValidateDelta", () => {
  const prev = process.env.CYBERREADY_SOCK;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.CYBERREADY_SOCK;
    } else {
      process.env.CYBERREADY_SOCK = prev;
    }
  });

  it("returns not_installed when CYBERREADY_SOCK is missing", () => {
    delete process.env.CYBERREADY_SOCK;
    const result = cyberreadyValidateDelta();
    expect(result).toEqual({ ok: false, reason: "not_installed" });
  });

  it("returns unavailable when sock path does not exist", () => {
    const missing = path.join(os.tmpdir(), `cyberready-missing-${Date.now()}.sock`);
    process.env.CYBERREADY_SOCK = missing;
    const result = cyberreadyValidateDelta();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unavailable");
  });

  it("does not throw when sock path is a non-socket file", () => {
    const file = path.join(os.tmpdir(), `cyberready-file-${Date.now()}.txt`);
    fs.writeFileSync(file, "not-a-socket");
    try {
      expect(() => cyberreadyValidateDelta({ sockPath: file })).not.toThrow();
      const result = cyberreadyValidateDelta({ sockPath: file });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("unavailable");
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});
