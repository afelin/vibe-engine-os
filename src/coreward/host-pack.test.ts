import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOST_IDS,
  HOST_PACK_MANIFEST,
  applyHostPack,
  isHostId,
  resolveTemplatesRoot,
  runHostPackCli,
} from "./host-pack.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mkTemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coreward-host-pack-"));
  tempDirs.push(dir);
  return dir;
}

describe("host-pack", () => {
  it("accepts known host ids", () => {
    for (const id of HOST_IDS) {
      expect(isHostId(id)).toBe(true);
    }
    expect(isHostId("codex")).toBe(false);
  });

  it("templates exist for every manifest entry", () => {
    const root = resolveTemplatesRoot(path.resolve("."));
    for (const host of HOST_IDS) {
      for (const file of HOST_PACK_MANIFEST[host]) {
        expect(
          fs.existsSync(path.join(root, file.from)),
          `${host}:${file.from}`,
        ).toBe(true);
      }
    }
  });

  it("writes Claude pack into empty cwd", () => {
    const target = mkTemp();
    const result = applyHostPack({ host: "claude", targetRoot: target });
    expect(result.written.sort()).toEqual([".mcp.json", "CLAUDE.md"].sort());
    expect(result.skipped).toEqual([]);
    const mcp = JSON.parse(
      fs.readFileSync(path.join(target, ".mcp.json"), "utf8"),
    ) as {
      mcpServers: { "coreward-release-gates": { args: string[] } };
    };
    expect(mcp.mcpServers["coreward-release-gates"].args).toEqual([
      "-y",
      "@coreward/mcp",
    ]);
    expect(fs.readFileSync(path.join(target, "CLAUDE.md"), "utf8")).toMatch(
      /preflight/,
    );
  });

  it("writes OpenCode + Zed adopt MCP shapes", () => {
    const target = mkTemp();
    applyHostPack({ host: "opencode", targetRoot: target });
    applyHostPack({ host: "zed", targetRoot: target });

    const opencode = JSON.parse(
      fs.readFileSync(path.join(target, "opencode.json"), "utf8"),
    ) as {
      mcp: {
        "coreward-release-gates": { type: string; command: string[] };
      };
    };
    expect(opencode.mcp["coreward-release-gates"].type).toBe("local");
    expect(opencode.mcp["coreward-release-gates"].command).toEqual([
      "npx",
      "-y",
      "@coreward/mcp",
    ]);

    const zed = JSON.parse(
      fs.readFileSync(path.join(target, ".zed/settings.json"), "utf8"),
    ) as {
      context_servers: {
        "coreward-release-gates": {
          source: string;
          command: string;
          args: string[];
        };
      };
    };
    expect(zed.context_servers["coreward-release-gates"].source).toBe(
      "custom",
    );
    expect(zed.context_servers["coreward-release-gates"].args).toContain(
      "@coreward/mcp",
    );
  });

  it("skips existing files unless --force", () => {
    const target = mkTemp();
    fs.writeFileSync(path.join(target, ".mcp.json"), "{}\n", "utf8");
    const first = applyHostPack({ host: "claude", targetRoot: target });
    expect(first.skipped).toContain(".mcp.json");
    expect(first.written).toContain("CLAUDE.md");

    const forced = applyHostPack({
      host: "claude",
      targetRoot: target,
      force: true,
    });
    expect(forced.written).toContain(".mcp.json");
    const mcp = JSON.parse(
      fs.readFileSync(path.join(target, ".mcp.json"), "utf8"),
    ) as { mcpServers?: unknown };
    expect(mcp.mcpServers).toBeTruthy();
  });

  it("CLI exits 1 without --host and 0 for claude", () => {
    const target = mkTemp();
    expect(runHostPackCli(["node", "host-pack.ts"])).toBe(1);
    expect(
      runHostPackCli([
        "node",
        "host-pack.ts",
        "--host",
        "claude",
        "--root",
        target,
      ]),
    ).toBe(0);
    expect(fs.existsSync(path.join(target, ".mcp.json"))).toBe(true);
  });
});
