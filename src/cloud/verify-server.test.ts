import * as http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createVerifyServer } from "./verify-server.js";

describe("verify server", () => {
  let server: http.Server | null = null;

  afterEach(() => {
    server?.close();
    server = null;
  });

  it("serves /health and /schemas", async () => {
    server = createVerifyServer({ port: 0 });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 8787;

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const schemas = await fetch(`http://127.0.0.1:${port}/schemas`);
    expect(schemas.status).toBe(200);
    const body = (await schemas.json()) as Record<string, unknown>;
    expect(body.ExecutionDag).toMatchObject({ type: "object" });
  });

  it("returns 404 for unknown routes", async () => {
    server = createVerifyServer({ port: 0 });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 8787;
    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
  });
});
