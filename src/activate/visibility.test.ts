import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderGovernanceStrip,
  resolveGovernanceVisibility,
} from "./visibility.js";
import { writeCorewardModeConfig } from "../coreward/mode.js";
import { authorizeWrite } from "../coreward/authorize-write.js";

const roots: string[] = [];

afterEach(() => {
  delete process.env.COREWARD_AUTHORIZE_TICKET;
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("governance visibility strip", () => {
  it("prints LEGACY · OFF · none by default", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vis-"));
    roots.push(root);
    const strip = renderGovernanceStrip(root);
    expect(strip).toBe("Ward LEGACY · Mode OFF · ticket none");
    expect(resolveGovernanceVisibility(root).ward).toBe("LEGACY");
  });

  it("shows Mode ON and ticket fresh after authorize", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vis-"));
    roots.push(root);
    writeCorewardModeConfig(root, { enabled: true });
    const auth = authorizeWrite({
      root_dir: root,
      proposed_files: ["src/ok.ts"],
    });
    expect(auth.ok).toBe(true);
    const strip = renderGovernanceStrip(root);
    expect(strip).toMatch(/Ward LEGACY · Mode ON · ticket fresh/);
  });
});
