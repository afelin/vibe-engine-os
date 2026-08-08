import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const bin = join(repoRoot, "packages/mcp/bin/coreward-mcp.js");
const buildScript = join(repoRoot, "scripts/build-mcp-package.mjs");

function frameMessage(payload: unknown): Buffer {
  const body = JSON.stringify(payload);
  return Buffer.from(
    `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`,
  );
}

function readFramedMessage(buffer: Buffer): { message: unknown; rest: Buffer } {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  const header = buffer.slice(0, headerEnd).toString("utf8");
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) throw new Error("Missing Content-Length header");
  const length = Number(match[1]);
  const start = headerEnd + 4;
  const end = start + length;
  return {
    message: JSON.parse(buffer.slice(start, end).toString("utf8")),
    rest: buffer.slice(end),
  };
}

describe("@coreward/mcp package entry", () => {
  beforeAll(() => {
    const built = spawnSync(process.execPath, [buildScript], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(built.status, built.stderr || built.stdout).toBe(0);
    expect(existsSync(join(repoRoot, "packages/mcp/dist/cli.js"))).toBe(true);
  }, 60_000);

  it(
    "speaks initialize over stdio and lists tools with COREWARD_ROOT",
    async () => {
      const child = spawn(process.execPath, [bin], {
        cwd: "/tmp",
        env: { ...process.env, COREWARD_ROOT: repoRoot },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = Buffer.alloc(0);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = Buffer.concat([stdout, chunk]);
      });

      child.stdin.write(
        frameMessage({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "vitest-mcp-pkg", version: "0.1.0" },
          },
        }),
      );

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("MCP initialize timeout")),
          20_000,
        );
        const onData = () => {
          if (stdout.indexOf("\r\n\r\n") !== -1 && stdout.includes("{")) {
            clearTimeout(timeout);
            child.stdout.off("data", onData);
            resolve();
          }
        };
        child.stdout.on("data", onData);
        onData();
      });

      const { message, rest } = readFramedMessage(stdout);
      expect(message).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: {
          serverInfo: { name: "coreward-release-gates" },
        },
      });

      stdout = rest;
      const toolsPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("MCP tools/list timeout")),
          20_000,
        );
        const onData = () => {
          if (stdout.indexOf("\r\n\r\n") !== -1 && stdout.includes("{")) {
            clearTimeout(timeout);
            child.stdout.off("data", onData);
            resolve();
          }
        };
        child.stdout.on("data", onData);
        onData();
      });

      child.stdin.write(
        frameMessage({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      );
      await toolsPromise;

      const listed = readFramedMessage(stdout).message as {
        result?: { tools?: Array<{ name: string }> };
      };
      const names = (listed.result?.tools ?? []).map((t) => t.name);
      expect(names).toContain("preflight");
      expect(names).toContain("authorize_write");

      child.kill();
    },
    45_000,
  );
});
