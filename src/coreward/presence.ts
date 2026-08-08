/**
 * Tiny Coreward presence file for hooks/status consumers.
 * Not a product surface — written by init + successful authorize.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { isCorewardMode } from "./mode.js";

const PRESENCE_REL = path.join(".vibe", "coreward-presence.json");

export type CorewardPresence = {
  mode: "ON" | "OFF";
  ticket_id: string | null;
  updated_at: string;
};

export function corewardPresencePath(rootDir: string): string {
  return path.join(rootDir, PRESENCE_REL);
}

export function readCorewardPresence(
  rootDir = ".",
): CorewardPresence | null {
  const filePath = corewardPresencePath(rootDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      mode?: unknown;
      ticket_id?: unknown;
      updated_at?: unknown;
    };
    const mode = raw.mode === "ON" || raw.mode === "OFF" ? raw.mode : null;
    if (!mode) return null;
    return {
      mode,
      ticket_id:
        typeof raw.ticket_id === "string"
          ? raw.ticket_id
          : raw.ticket_id === null
            ? null
            : null,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeCorewardPresence(
  rootDir: string,
  opts: { ticket_id?: string | null; now?: Date } = {},
): CorewardPresence {
  const presence: CorewardPresence = {
    mode: isCorewardMode(rootDir) ? "ON" : "OFF",
    ticket_id: opts.ticket_id ?? null,
    updated_at: (opts.now ?? new Date()).toISOString(),
  };
  const filePath = corewardPresencePath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(presence, null, 2)}\n`, "utf8");
  return presence;
}
