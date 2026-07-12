import { createServer } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { callReleaseGateTool } from "../release-gate/mcp-handlers.js";
import { computeVowsHash } from "../constitution/vows.js";
import { exportCatalogJsonSchema } from "../constitution/parse.js";
import { readRunManifest, readActorSnapshot } from "../run/manifest.js";
import { sanitizeRunId } from "../run/paths.js";
import {
  computeCapsuleHash,
  readTraceTail,
} from "../constitution/capsule.js";

export type VerifyServerOptions = {
  port?: number;
  rootDir?: string;
};

export function createVerifyServer(options: VerifyServerOptions = {}) {
  const port = options.port ?? 8787;
  const rootDir = options.rootDir ?? ".";

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (req.method === "GET" && url.pathname === "/schemas") {
      const schemas = exportCatalogJsonSchema();
      sendJson(res, 200, schemas);
      return;
    }

    if (req.method === "POST" && url.pathname === "/verify-capsule") {
      const body = await readBody(req);
      let payload: { run_id?: string; root_dir?: string };
      try {
        payload = JSON.parse(body) as { run_id?: string; root_dir?: string };
      } catch {
        sendJson(res, 400, { valid: false, error: "Invalid JSON body" });
        return;
      }

      const runRoot = payload.root_dir ?? rootDir;
      const runIdRaw = payload.run_id;
      if (!runIdRaw) {
        sendJson(res, 400, { valid: false, error: "run_id required" });
        return;
      }

      let runId: string;
      try {
        runId = sanitizeRunId(runIdRaw);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Invalid run_id";
        sendJson(res, 400, { valid: false, error: message });
        return;
      }

      const manifest = readRunManifest(runRoot, runId);
      const snapshot = readActorSnapshot(runRoot, runId);
      if (!manifest) {
        sendJson(res, 404, { valid: false, error: "manifest not found" });
        return;
      }

      const capsuleHash = computeCapsuleHash({
        manifest,
        snapshot,
        traceTail: readTraceTail(runRoot, runId),
      });
      const vowsHash = computeVowsHash(runRoot);
      const valid = manifest.vowsHash === vowsHash;

      sendJson(res, 200, {
        valid,
        capsuleHash,
        vowsHash,
        vowsCompliant: valid,
        manifest,
        snapshotPresent: snapshot !== null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown,
) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

export function startVerifyServer(options: VerifyServerOptions = {}) {
  const port = options.port ?? Number(process.env.VIBE_VERIFY_PORT ?? 8787);
  const server = createVerifyServer({ ...options, port });
  server.listen(port, () => {
    process.stdout.write(`Constitution verify server listening on :${port}\n`);
  });
  return server;
}

import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startVerifyServer();
}
