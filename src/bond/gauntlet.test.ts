import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseGauntletJsonl,
  runTaskBondGauntlet,
} from "./gauntletRunner.js";

describe("taskbond gauntlet", () => {
  it("runs all evals/taskbond-gauntlet.jsonl cases green", () => {
    const casesPath = path.join(process.cwd(), "evals/taskbond-gauntlet.jsonl");
    const cases = parseGauntletJsonl(fs.readFileSync(casesPath, "utf8"));
    const scorecard = runTaskBondGauntlet(cases, ".");
    expect(scorecard.fail).toBe(0);
    expect(scorecard.pass).toBe(cases.length);
  });

  it("tabdab profile allows Lovable paths", () => {
    const previous = process.env.VIBE_PROJECT_PROFILE;
    process.env.VIBE_PROJECT_PROFILE = "tabdab";
    try {
      const scorecard = runTaskBondGauntlet(
        [
          {
            id: "tabdab-spot",
            category: "tabdab",
            depth: 3,
            intent: "Component",
            boundFiles: ["src/components/admin/Card.tsx"],
            expect: { ok: true },
          },
        ],
        ".",
      );
      expect(scorecard.fail).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.VIBE_PROJECT_PROFILE;
      else process.env.VIBE_PROJECT_PROFILE = previous;
    }
  });
});
