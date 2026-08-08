import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  confirmCursorHooks,
  cursorDirRel,
  runCorewardInit,
  syncCursorMcpJson,
  syncCursorRule,
} from "./init.js";
import { COREWARD_CURSOR_RULE } from "./cursor-rule.js";
import { clearAuthorizeTicketBindings } from "./authorize-write.js";
import { readCorewardPresence } from "./presence.js";

/** OS blocks mkdir of literal `.cursor` outside the real project — tests use this. */
const TEST_CURSOR = ".cw-cursor";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coreward-init-"));
}

function seedInitRoot(root: string): void {
  const dir = cursorDirRel();
  fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".github", "workflows", "forever.yml"),
    'env:\n  VIBE_WARD_STRICT: "1"\n',
    "utf8",
  );
  fs.mkdirSync(path.join(root, dir, "hooks"), { recursive: true });
  fs.writeFileSync(
    path.join(root, dir, "hooks.json"),
    JSON.stringify(
      {
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            {
              command: `${dir}/hooks/coreward-soft-remind.sh`,
              timeout: 5,
            },
          ],
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, dir, "hooks", "coreward-soft-remind.sh"),
    "#!/usr/bin/env bash\necho allow\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          "coreward-release-gates": {
            command: "npx",
            args: ["tsx", "src/release-gate/mcp.ts"],
          },
          "vibe-release-gates": {
            command: "npx",
            args: ["tsx", "src/release-gate/mcp.ts"],
          },
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

describe("coreward:init sync helpers", () => {
  beforeEach(() => {
    process.env.COREWARD_TEST_CURSOR_DIR = TEST_CURSOR;
  });
  afterEach(() => {
    delete process.env.COREWARD_TEST_CURSOR_DIR;
  });

  it("syncCursorMcpJson writes single coreward-release-gates server", () => {
    const root = tmpRoot();
    try {
      fs.mkdirSync(path.join(root, TEST_CURSOR), { recursive: true });
      fs.writeFileSync(
        path.join(root, TEST_CURSOR, "mcp.json"),
        JSON.stringify({
          mcpServers: {
            "coreward-release-gates": { command: "npx" },
            "vibe-release-gates": { command: "npx" },
          },
        }),
        "utf8",
      );
      const msg = syncCursorMcpJson(root);
      expect(msg).toMatch(/Synced|Wrote|single/);
      const raw = JSON.parse(
        fs.readFileSync(path.join(root, TEST_CURSOR, "mcp.json"), "utf8"),
      ) as { mcpServers: Record<string, unknown> };
      expect(Object.keys(raw.mcpServers)).toEqual(["coreward-release-gates"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("syncCursorRule writes alwaysApply coreward.mdc", () => {
    const root = tmpRoot();
    try {
      const msg = syncCursorRule(root);
      expect(msg).toMatch(/Wrote|Refreshed/);
      const rulePath = path.join(root, TEST_CURSOR, "rules", "coreward.mdc");
      expect(fs.existsSync(rulePath)).toBe(true);
      const body = fs.readFileSync(rulePath, "utf8");
      expect(body).toContain("alwaysApply: true");
      expect(body).toContain("preflight");
      expect(body).toBe(
        COREWARD_CURSOR_RULE.endsWith("\n")
          ? COREWARD_CURSOR_RULE
          : `${COREWARD_CURSOR_RULE}\n`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("confirmCursorHooks reports wired soft remind", () => {
    const root = tmpRoot();
    try {
      seedInitRoot(root);
      expect(confirmCursorHooks(root)).toMatch(/soft hooks confirmed/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("coreward:init run", () => {
  beforeEach(() => {
    process.env.COREWARD_TEST_CURSOR_DIR = TEST_CURSOR;
  });
  afterEach(() => {
    delete process.env.COREWARD_TEST_CURSOR_DIR;
    delete process.env.COREWARD_AUTHORIZE_TICKET;
    delete process.env.COREWARD_MODE;
    clearAuthorizeTicketBindings();
    vi.restoreAllMocks();
  });

  it("prints ON chip, writes presence, and exits 0", () => {
    const root = tmpRoot();
    try {
      seedInitRoot(root);
      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
        logs.push(args.map(String).join(" "));
      });
      const code = runCorewardInit(root);
      spy.mockRestore();
      expect(code).toBe(0);
      const out = logs.join("\n");
      expect(out).toContain("Coreward ON");
      expect(out).toContain("════════════════════════════════");
      expect(out).toMatch(/aw_/);
      expect(out).toContain("If MCP is offline:");
      expect(
        fs.existsSync(path.join(root, TEST_CURSOR, "rules", "coreward.mdc")),
      ).toBe(true);
      const cursorMcp = JSON.parse(
        fs.readFileSync(path.join(root, TEST_CURSOR, "mcp.json"), "utf8"),
      ) as { mcpServers: Record<string, unknown> };
      expect(Object.keys(cursorMcp.mcpServers)).toEqual([
        "coreward-release-gates",
      ]);
      const presence = readCorewardPresence(root);
      expect(presence?.mode).toBe("ON");
      expect(presence?.ticket_id).toMatch(/^aw_/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("committed Cursor rule", () => {
  it("exists with alwaysApply true", () => {
    const rulePath = path.join(
      process.cwd(),
      ".cursor",
      "rules",
      "coreward.mdc",
    );
    expect(fs.existsSync(rulePath)).toBe(true);
    const body = fs.readFileSync(rulePath, "utf8");
    expect(body).toContain("alwaysApply: true");
    expect(body).toContain("preflight");
    expect(body).toMatch(/not a kernel IDE sandbox/i);
  });
});

describe("soft hook fail-open", () => {
  it("allows when Mode off", () => {
    const root = tmpRoot();
    try {
      const script = path.join(
        process.cwd(),
        ".cursor",
        "hooks",
        "coreward-soft-remind.sh",
      );
      const result = spawnSync("bash", [script], {
        cwd: root,
        input: "{}",
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim()) as {
        permission?: string;
      };
      expect(parsed.permission).toBe("allow");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("one-line remind when Mode on without ticket", () => {
    const root = tmpRoot();
    try {
      fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".vibe", "coreward-mode.json"),
        JSON.stringify({ enabled: true }),
        "utf8",
      );
      const script = path.join(
        process.cwd(),
        ".cursor",
        "hooks",
        "coreward-soft-remind.sh",
      );
      const result = spawnSync("bash", [script], {
        cwd: root,
        input: "{}",
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim()) as {
        permission?: string;
        agent_message?: string;
      };
      expect(parsed.permission).toBe("allow");
      expect(parsed.agent_message).toBe(
        "Coreward: call preflight (Mode ON, no fresh ticket)",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
