import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildScopedRepomix,
  collectImportClosure,
  resolveLocalImport,
  resolveScopedFiles,
} from "./scoped-repomix.js";
import type { ExecutionDag } from "../os/events.js";

describe("scoped repomix", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("includes planned files and one-hop local imports", () => {
    const root = makeFixture(tmpDirs);
    const dag: ExecutionDag = {
      issueNumber: "1",
      title: "Scoped",
      nodes: [
        {
          id: "edit-1",
          title: "Edit main",
          kind: "edit",
          dependsOn: [],
          risk: "low",
          files: ["src/main.ts"],
          acceptance: ["ok"],
        },
      ],
    };

    const files = resolveScopedFiles(root, dag);
    expect(files).toContain("src/main.ts");
    expect(files).toContain("src/util.ts");
  });

  it("builds scoped context over 500 chars for fixture tree", () => {
    const root = makeFixture(tmpDirs);
    const dag: ExecutionDag = {
      issueNumber: "1",
      title: "Scoped",
      nodes: [
        {
          id: "edit-1",
          title: "Edit",
          kind: "edit",
          dependsOn: [],
          risk: "low",
          files: ["src/main.ts", "src/util.ts"],
          acceptance: ["ok"],
        },
      ],
    };

    const context = buildScopedRepomix(root, dag);
    expect(context.length).toBeGreaterThanOrEqual(500);
    expect(context).toContain("src/main.ts");
  });

  it("never escapes ticket∪import closure via path traversal", () => {
    const root = makeFixture(tmpDirs);
    fs.writeFileSync(
      path.join(root, "src/evil.ts"),
      `import { x } from "../../etc/passwd";\nexport const evil = 1;\n`,
    );
    const closure = collectImportClosure(root, ["src/evil.ts"], 2);
    expect(closure).toContain("src/evil.ts");
    expect(closure.every((p) => !p.includes(".."))).toBe(true);
    expect(closure.every((p) => !p.startsWith("/"))).toBe(true);
    expect(resolveLocalImport(root, "src", "../../etc/passwd")).toBeNull();
  });

  it("caps hops so 0-hop is seed only", () => {
    const root = makeFixture(tmpDirs);
    const zero = collectImportClosure(root, ["src/main.ts"], 0);
    expect(zero).toEqual(["src/main.ts"]);
    const one = collectImportClosure(root, ["src/main.ts"], 1);
    expect(one).toContain("src/util.ts");
  });
});

function makeFixture(tmpDirs: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-scope-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const padding = "// context padding line\n".repeat(40);
  fs.writeFileSync(
    path.join(root, "src/util.ts"),
    `${padding}export const utilValue = "helper";\n`,
  );
  fs.writeFileSync(
    path.join(root, "src/main.ts"),
    `${padding}import { utilValue } from "./util.js";\nexport const mainValue = utilValue;\n`,
  );
  return root;
}
