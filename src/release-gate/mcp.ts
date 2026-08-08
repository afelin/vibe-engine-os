import { fileURLToPath } from "node:url";
import { handleMcpRequest, type JsonRpcRequest } from "./mcp-handlers.js";

function writeMessage(payload: unknown): void {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

export function startReleaseGateMcpServer(): void {
  let buffer = "";
  let contentLength: number | null = null;

  process.stdin.on("readable", () => {
    let chunk: Buffer | null;
    while ((chunk = process.stdin.read()) !== null) {
      buffer += chunk.toString("utf8");

      while (true) {
        if (contentLength === null) {
          const headerEnd = buffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) break;

          const header = buffer.slice(0, headerEnd);
          const match = header.match(/Content-Length:\s*(\d+)/i);
          if (!match) {
            buffer = buffer.slice(headerEnd + 4);
            continue;
          }

          contentLength = Number(match[1]);
          buffer = buffer.slice(headerEnd + 4);
        }

        if (buffer.length < contentLength) break;

        const body = buffer.slice(0, contentLength);
        buffer = buffer.slice(contentLength);
        contentLength = null;

        const message = JSON.parse(body) as JsonRpcRequest;
        const response = handleMcpRequest(message);
        if (response) {
          writeMessage(response);
        }
      }
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startReleaseGateMcpServer();
}
