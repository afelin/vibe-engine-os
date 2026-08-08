import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  consumeExplainPacket,
  cyberreadyExplainPacket,
  cyberreadyValidateDelta,
} from "./cyberready-bridge.js";

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
    const missing = path.join(
      os.tmpdir(),
      `cyberready-missing-${Date.now()}.sock`,
    );
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

describe("consumeExplainPacket", () => {
  it("accepts airlocked packet and requires recheck", () => {
    const pkt = {
      schema_version: "1",
      untrusted_metadata:
        '<untrusted_metadata>{"instruction":"re-check"}</untrusted_metadata>',
      failures: [],
    };
    const r = consumeExplainPacket(pkt);
    expect(r.ok).toBe(true);
    expect(r.must_recheck).toBe(true);
    expect(r.untrusted_metadata).toContain("<untrusted_metadata>");
  });

  it("refuses absolute home paths", () => {
    const r = consumeExplainPacket({
      untrusted_metadata:
        '<untrusted_metadata>{"path":"/Users/alice/secret"}</untrusted_metadata>',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("refused");
    expect(r.must_recheck).toBe(true);
  });

  it("refuses PEM blobs", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\n" +
      "MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF6PZGFw7N+EXAMPLEKEYMATERIAL12\n" +
      "34567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345\n" +
      "-----END RSA PRIVATE KEY-----";
    const r = consumeExplainPacket({
      untrusted_metadata: `<untrusted_metadata>${pem}</untrusted_metadata>`,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("refused");
  });

  it("refuses missing wrapper", () => {
    const r = consumeExplainPacket({ untrusted_metadata: "plain text" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("refused");
  });
});

describe("cyberreadyExplainPacket", () => {
  it("reads packet_path fixture", () => {
    const file = path.join(os.tmpdir(), `explain-${Date.now()}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({
        untrusted_metadata:
          '<untrusted_metadata>{"ok":false}</untrusted_metadata>',
      }),
    );
    try {
      const r = cyberreadyExplainPacket({ packetPath: file });
      expect(r.ok).toBe(true);
      expect(r.must_recheck).toBe(true);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("fail-open not_installed without sock", () => {
    delete process.env.CYBERREADY_SOCK;
    const r = cyberreadyExplainPacket();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_installed");
    expect(r.must_recheck).toBe(true);
  });
});
