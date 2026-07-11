import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

function frameMessage(payload: unknown): Buffer {
  const body = JSON.stringify(payload);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function readFramedMessage(buffer: Buffer): { message: unknown; rest: Buffer } {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  const header = buffer.slice(0, headerEnd).toString("utf8");
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) {
    throw new Error("Missing Content-Length header");
  }

  const length = Number(match[1]);
  const start = headerEnd + 4;
  const end = start + length;
  const body = buffer.slice(start, end).toString("utf8");

  return {
    message: JSON.parse(body),
    rest: buffer.slice(end),
  };
}

describe("release gate MCP stdio transport", () => {
  it("responds to initialize over Content-Length framing", async () => {
    const child = spawn("npx", ["tsx", "src/release-gate/mcp.ts"], {
      cwd: process.cwd(),
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
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      }),
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MCP timeout")), 5000);
      const interval = setInterval(() => {
        if (stdout.indexOf("\r\n\r\n") !== -1 && stdout.includes("{")) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 20);
    });

    const { message } = readFramedMessage(stdout);
    expect(message).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "vibe-release-gates" },
      },
    });

    child.kill();
  });
});
