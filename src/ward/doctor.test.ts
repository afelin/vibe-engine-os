import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkMandateActor,
  checkPrincipalsIfMandate,
  checkStrictInWorkflow,
  runWardDoctor,
} from "./doctor.js";
import { clearActiveMandate, writeActiveMandate } from "./index.js";

describe("ward:doctor", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ward-doc-"));
    tmpDirs.push(root);
    return root;
  }

  it("fails when forever.yml lacks VIBE_WARD_STRICT", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".github", "workflows", "forever.yml"),
      "name: x\njobs: {}\n",
      "utf8",
    );
    const check = checkStrictInWorkflow(root);
    expect(check.ok).toBe(false);
  });

  it("passes STRICT when present; fails Mandate with *", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
    fs.mkdirSync(path.join(root, ".vibe"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".github", "workflows", "forever.yml"),
      'env:\n  VIBE_WARD_STRICT: "1"\n',
      "utf8",
    );
    expect(checkStrictInWorkflow(root).ok).toBe(true);

    writeActiveMandate(root, {
      mandate_id: "m",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      authorized_actor: "*",
      path_constraints: ["src/"],
      actions: ["promote"],
      issuer_public_key: "x",
      signature: "y",
    });
    expect(checkMandateActor(root).ok).toBe(false);
    expect(checkPrincipalsIfMandate(root).ok).toBe(false);

    clearActiveMandate(root);
    const result = runWardDoctor(root, {});
    expect(result.ok).toBe(true);
    expect(result.checks.some((c) => c.soft)).toBe(true);
  });
});
