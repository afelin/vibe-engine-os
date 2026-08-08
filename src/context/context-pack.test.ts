import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseContextPack } from "../constitution/parse.js";
import {
  buildContextPack,
  clearContextPackCache,
  CONTEXT_PACK_VERSION,
} from "./context-pack.js";

describe("ContextPack v1", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    clearContextPackCache();
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses schema fixture", () => {
    const pack = parseContextPack({
      version: CONTEXT_PACK_VERSION,
      ticket_id: "aw_test",
      root: "/tmp/repo",
      paths: ["src/a.ts"],
      nodes: [{ id: "file:src/a.ts", kind: "file", path: "src/a.ts" }],
      edges: [{ from: "ticket", to: "file:src/a.ts", kind: "bound" }],
      lessons: [],
      char_budget: 16000,
      hops: 1,
      cache_key: "abc",
      built_at: "2026-08-08T12:00:00.000Z",
    });
    expect(pack.version).toBe("context_pack.v1");
    expect(pack.ticket_id).toBe("aw_test");
  });

  it("builds pack and hits cache on second call", () => {
    const root = makeFixture(tmpDirs);
    const first = buildContextPack(root, {
      bond_files: ["src/main.ts"],
      ticket_id: "aw_cache",
      maxHops: 1,
      charBudget: 8000,
      now: () => "2026-08-08T12:00:00.000Z",
    });
    expect(first.graph_cache_hit).toBeUndefined();
    expect(first.paths).toContain("src/main.ts");
    expect(first.paths).toContain("src/util.ts");
    expect(first.nodes.some((n) => n.kind === "file")).toBe(true);
    expect(first.edges.some((e) => e.kind === "imports")).toBe(true);

    const second = buildContextPack(root, {
      bond_files: ["src/main.ts"],
      ticket_id: "aw_cache",
      maxHops: 1,
      charBudget: 8000,
      now: () => "2026-08-08T12:00:00.000Z",
    });
    expect(second.graph_cache_hit).toBe(true);
    expect(second.cache_key).toBe(first.cache_key);
  });
});

function makeFixture(tmpDirs: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-pack-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src/util.ts"),
    `export const utilValue = "helper";\n`,
  );
  fs.writeFileSync(
    path.join(root, "src/main.ts"),
    `import { utilValue } from "./util.js";\nexport const mainValue = utilValue;\n`,
  );
  return root;
}
