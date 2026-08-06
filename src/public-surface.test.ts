/**
 * Guards: public Pages / RISE export never ships internal GTM or secrets paths.
 * Also: GTM body must not live in the public git clone surface.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

/** Pricing / tier markers that must not appear in committed GTM stubs. */
const GTM_BODY_MARKERS = [/\|\s*\*\*Vibe\+\*\*/, /~\s*\$12\/mo/, /CAC\s*~\s*\$0/i, /When to pay/i];

describe("public / internal surface split", () => {
  it("keeps GTM stub under internal/ with an engineering-only README", () => {
    expect(existsSync(join(root, "internal/go-to-market.md"))).toBe(true);
    expect(existsSync(join(root, "internal/README.md"))).toBe(true);
    const internalReadme = read("internal/README.md");
    expect(internalReadme).toMatch(/not for public mirrors/i);
    expect(internalReadme).toMatch(/not published to Pages/i);
    expect(internalReadme).toMatch(/Do not commit commercial GTM/i);
  });

  it("internal/go-to-market.md is a stub (no commercial GTM body)", () => {
    const stub = read("internal/go-to-market.md");
    expect(stub).toMatch(/outside this public repo/i);
    expect(stub).toMatch(/Do not commit secrets or paid GTM/i);
    for (const re of GTM_BODY_MARKERS) {
      expect(stub).not.toMatch(re);
    }
  });

  it("docs/go-to-market.md is a stub (no tiers table; no internal body pointer as source of truth)", () => {
    const stub = read("docs/go-to-market.md");
    expect(stub).toMatch(/outside.*public/i);
    expect(stub).not.toMatch(/\|\s*\*\*Vibe\+\*\*/);
    expect(stub).not.toMatch(/~\s*\$12\/mo/);
    for (const re of GTM_BODY_MARKERS) {
      expect(stub).not.toMatch(re);
    }
  });

  it("rise-export denylist names internal/ and go-to-market", () => {
    const rise = read("docs/rise-export.md");
    expect(rise).toMatch(/`?internal\/`?/);
    expect(rise).toMatch(/go-to-market/);
    expect(rise).toMatch(/\.public-mirror-exclude/);
    expect(rise).toMatch(/prepare-public-tree\.sh/);
    expect(rise).toMatch(/do not commit/i);
  });

  it("PUBLIC.md documents the split, Pages scope, and git clone visibility", () => {
    const pub = read("docs/PUBLIC.md");
    expect(pub).toMatch(/internal\//);
    expect(pub).toMatch(/prepare-public-tree/);
    expect(pub).toMatch(/pages\.yml/i);
    expect(pub).toMatch(/clones this public repo/i);
    expect(pub).toMatch(/Do \*\*not\*\* commit commercial GTM/i);
  });

  it(".public-mirror-exclude denies internal/ and go-to-market", () => {
    const ex = read(".public-mirror-exclude");
    expect(ex).toMatch(/^internal\/$/m);
    expect(ex).toMatch(/docs\/go-to-market\.md/);
    expect(ex).toMatch(/^\.env$/m);
    expect(ex).toMatch(/^\.vibe\/$/m);
  });

  it("README does not link public readers to GTM", () => {
    const readme = read("README.md");
    expect(readme).not.toMatch(/\]\(docs\/go-to-market\.md\)/);
    expect(readme).not.toMatch(/\]\(internal\/go-to-market\.md\)/);
  });

  it("pages.yml only builds site/papers/proof and uploads site/", () => {
    const pages = read(".github/workflows/pages.yml");
    expect(pages).toMatch(/path:\s*site\b/);
    expect(pages).toMatch(/['"]site\/\*\*['"]/);
    expect(pages).toMatch(/['"]papers\/\*\*['"]/);
    expect(pages).toMatch(/['"]proof\/\*\*['"]/);
    expect(pages).toMatch(/Guard — Pages artifact has no internal/);
    // Trigger paths must not include internal/ as a source of Pages content
    const pathBlock = pages.match(/paths:\n([\s\S]*?)workflow_dispatch/)?.[1] ?? "";
    expect(pathBlock).not.toMatch(/internal\//);
    expect(pathBlock).not.toMatch(/go-to-market/);
  });

  it(
    "prepare-public-tree.sh omits internal/ and go-to-market from the export",
    () => {
      const out = mkdtempSync(join(tmpdir(), "vibe-public-tree-"));
      try {
        execFileSync("bash", [join(root, "scripts/prepare-public-tree.sh")], {
          cwd: root,
          env: { ...process.env, PUBLIC_TREE_OUT: out },
          encoding: "utf8",
        });
        expect(existsSync(join(out, "internal"))).toBe(false);
        expect(existsSync(join(out, "docs/go-to-market.md"))).toBe(false);
        expect(existsSync(join(out, "docs/PUBLIC.md"))).toBe(true);
        expect(existsSync(join(out, "docs/rise-export.md"))).toBe(true);
        expect(existsSync(join(out, "site"))).toBe(true);
        expect(existsSync(join(out, "papers"))).toBe(true);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    20_000,
  );

  it(".gitignore keeps secrets and launch-proof data out of git", () => {
    const gi = read(".gitignore");
    expect(gi).toMatch(/^\.env$/m);
    expect(gi).toMatch(/^\.env\.\*$/m);
    expect(gi).toMatch(/^\.vibe\/\*$/m);
    expect(gi).toMatch(/launch-proof\.json\.example/);
    expect(gi).toMatch(/^dist\//m);
  });
});
