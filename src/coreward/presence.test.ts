import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readCorewardPresence,
  writeCorewardPresence,
} from "./presence.js";
import { writeCorewardModeConfig } from "./mode.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coreward-presence-"));
}

describe("coreward presence", () => {
  afterEach(() => {
    delete process.env.COREWARD_MODE;
  });

  it("writes and reads mode + ticket_id", () => {
    const root = tmpRoot();
    try {
      writeCorewardModeConfig(root, { enabled: true });
      const written = writeCorewardPresence(root, {
        ticket_id: "aw_test123",
        now: new Date("2026-08-08T12:00:00.000Z"),
      });
      expect(written.mode).toBe("ON");
      expect(written.ticket_id).toBe("aw_test123");
      expect(written.updated_at).toBe("2026-08-08T12:00:00.000Z");

      const read = readCorewardPresence(root);
      expect(read).toEqual(written);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when missing or corrupt", () => {
    const root = tmpRoot();
    try {
      expect(readCorewardPresence(root)).toBeNull();
      const p = path.join(root, ".vibe", "coreward-presence.json");
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, "{not-json", "utf8");
      expect(readCorewardPresence(root)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
