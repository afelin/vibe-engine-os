import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPromotionBundle,
  sha256Content,
  writePromotionBundle,
} from "./promotion.js";

describe("promotion bundle", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("writes and applies a manifest-bound bundle", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-promote-"));
    tmpDirs.push(root);

    const files = [
      { path: "src/example.ts", content: "export const value = 1;\n" },
      { path: "tests/example.test.ts", content: "import { value } from '../src/example.js';\n" },
    ];

    writePromotionBundle(root, "run-promo-1", files);
    const { applied } = applyPromotionBundle(root, "run-promo-1");

    expect(applied).toEqual(["src/example.ts", "tests/example.test.ts"]);
    expect(fs.readFileSync(path.join(root, "src/example.ts"), "utf8")).toBe(files[0]!.content);

    const index = JSON.parse(
      fs.readFileSync(path.join(root, ".runs/run-promo-1/promotion/index.json"), "utf8"),
    );
    expect(index.files[0]?.sha256).toBe(sha256Content(files[0]!.content));
  });

  it("rejects tampered bundle contents", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-promote-"));
    tmpDirs.push(root);

    writePromotionBundle(root, "run-promo-2", [
      { path: "src/tamper.ts", content: "export {};\n" },
    ]);

    fs.writeFileSync(
      path.join(root, ".runs/run-promo-2/promotion/files/src/tamper.ts"),
      "export const tampered = true;\n",
      "utf8",
    );

    expect(() => applyPromotionBundle(root, "run-promo-2")).toThrow(/SHA256 mismatch/);
  });
});
