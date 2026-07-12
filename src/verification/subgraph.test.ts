import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildVitestSubgraphCommand,
  mapChangedFilesToVitest,
} from "./subgraph.js";

describe("vitest subgraph", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps changed source files to sibling test files", () => {
    const root = makeFixture(tmpDirs);
    const tests = mapChangedFilesToVitest(["src/foo.ts"], root);
    expect(tests).toContain("src/foo.test.ts");
  });

  it("includes direct test file when changed", () => {
    const root = makeFixture(tmpDirs);
    const tests = mapChangedFilesToVitest(["src/foo.test.ts"], root);
    expect(tests).toEqual(["src/foo.test.ts"]);
  });

  it("builds vitest command for subgraph", () => {
    const cmd = buildVitestSubgraphCommand(["src/a.test.ts"]);
    expect(cmd).toContain("vitest run");
    expect(cmd).toContain("src/a.test.ts");
  });

  it("completes subgraph mapping quickly on a small fixture", () => {
    const root = makeFixture(tmpDirs);
    const started = Date.now();
    const tests = mapChangedFilesToVitest(["src/foo.ts"], root);
    const elapsed = Date.now() - started;
    expect(tests).toContain("src/foo.test.ts");
    expect(elapsed).toBeLessThan(1_000);
  });
});

function makeFixture(tmpDirs: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-subgraph-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/foo.ts"), "export {};\n");
  fs.writeFileSync(path.join(root, "src/foo.test.ts"), "import {} from './foo.js';\n");
  return root;
}
