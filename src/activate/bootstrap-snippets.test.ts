import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  bootstrapSnippetsSchema,
  renderBootstrapSnippets,
  writeBootstrapSnippets,
} from "./bootstrap-snippets.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("renderBootstrapSnippets", () => {
  it("includes MCP command and Cursor skill path", () => {
    const snippets = renderBootstrapSnippets(".");
    expect(snippets.cursor).toContain("mcp.json");
    expect(snippets.cursor).toContain("npx");
    expect(snippets.cursor).toContain("src/release-gate/mcp.ts");
    expect(snippets.cursor).toContain(".cursor/skills/coreward");
    expect(snippets.claude).toContain("coreward-release-gates");
    expect(snippets.claude).toContain("src/release-gate/mcp.ts");
    expect(snippets.codex).toContain("coreward-release-gates");
    expect(snippets.codex).toContain("src/release-gate/mcp.ts");
    expect(snippets.generic).toContain("preflight");
    expect(snippets.github).toContain("Coreward Request");
    expect(snippets.github).toContain("/go");
  });

  it("includes one-call preflight vow and operate docs", () => {
    const snippets = renderBootstrapSnippets(".");
    const joined = Object.values(snippets).join("\n");
    expect(joined).toMatch(/preflight/);
    expect(joined).toContain("docs/operate.md");
    expect(joined).toContain("docs/start-here.md");
  });

  it("validates written JSON against schema", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-bootstrap-"));
    tempDirs.push(root);
    const snippets = renderBootstrapSnippets(".");
    const outPath = writeBootstrapSnippets(root, snippets);
    expect(outPath).toBe(path.join(root, ".vibe/bootstrap-snippets.json"));
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf8"));
    const result = bootstrapSnippetsSchema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(
        ["claude", "codex", "cursor", "generic", "github"].sort(),
      );
    }
  });

  it("schema rejects incomplete payload", () => {
    const result = bootstrapSnippetsSchema.safeParse({ github: "x" });
    expect(result.success).toBe(false);
  });
});

describe("npm run bootstrap", () => {
  it(
    "exits 0 and writes bootstrap-snippets.json",
    () => {
    const nvmNode22 = path.join(
      process.env.HOME ?? "",
      ".nvm/versions/node/v22.23.1/bin",
    );
    const pathPrefix = fs.existsSync(path.join(nvmNode22, "node"))
      ? `${nvmNode22}:`
      : "";
    const result = spawnSync("bash", ["runs/bootstrap.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${pathPrefix}${process.env.PATH ?? ""}`,
      },
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("bootstrap");
    expect(result.stdout).toMatch(/Active legal space:/);
    const outPath = path.join(process.cwd(), ".vibe/bootstrap-snippets.json");
    expect(fs.existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf8"));
    expect(
      z
        .object({
          github: z.string().min(1),
          cursor: z.string().min(1),
          claude: z.string().min(1),
          codex: z.string().min(1),
          generic: z.string().min(1),
        })
        .safeParse(parsed).success,
    ).toBe(true);
  },
    30_000,
  );
});
