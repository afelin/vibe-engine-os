import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildContextBundle,
  formatContextBundleForPrompt,
  resolveContextFiles,
} from "./bundle.js";
import type { ExecutionDag } from "../os/events.js";

describe("ScopedContextBundle", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("always includes bond files in resolved context set", () => {
    const root = makeFixture(tmpDirs);
    const dag: ExecutionDag = {
      issueNumber: "1",
      title: "Bond",
      nodes: [
        {
          id: "edit-1",
          title: "Edit",
          kind: "edit",
          dependsOn: [],
          risk: "low",
          files: ["src/main.ts"],
          acceptance: ["ok"],
        },
      ],
    };

    const files = resolveContextFiles(root, dag, ["src/bond-only.ts"]);
    expect(files).toContain("src/bond-only.ts");
    expect(files).toContain("src/main.ts");
  });

  it("caps per-file content and marks bundle truncated", () => {
    const root = makeFixture(tmpDirs);
    fs.writeFileSync(
      path.join(root, "src/huge.ts"),
      "x".repeat(8000),
      "utf8",
    );

    const bundle = buildContextBundle(root, ["src/huge.ts"], {
      maxPerFileChars: 500,
      maxTotalChars: 16000,
    });

    expect(bundle.truncated).toBe(true);
    expect(bundle.files[0]?.content.length).toBeLessThan(8000);
    expect(bundle.files[0]?.contentHash).toHaveLength(64);
  });

  it("formats codegen prompt snippets with path headers", () => {
    const root = makeFixture(tmpDirs);
    const bundle = buildContextBundle(root, ["src/main.ts"]);
    const prompt = formatContextBundleForPrompt(bundle);

    expect(prompt).toContain("--- src/main.ts ---");
    expect(prompt).toContain("mainValue");
  });
});

function makeFixture(tmpDirs: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-bundle-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src/util.ts"),
    'export const utilValue = "helper";\n',
  );
  fs.writeFileSync(
    path.join(root, "src/main.ts"),
    'import { utilValue } from "./util.js";\nexport const mainValue = utilValue;\n',
  );
  fs.writeFileSync(
    path.join(root, "src/bond-only.ts"),
    'export const bondOnly = true;\n',
  );
  return root;
}
