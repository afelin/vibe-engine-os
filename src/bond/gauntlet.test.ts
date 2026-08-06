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

  it("runs redteam pack green (obfuscation, injection, eu-nis2-cra, size, /approve)", () => {
    const casesPath = path.join(
      process.cwd(),
      "evals/taskbond-gauntlet-redteam.jsonl",
    );
    const cases = parseGauntletJsonl(fs.readFileSync(casesPath, "utf8"));
    const scorecard = runTaskBondGauntlet(cases, ".", {
      casesRef: "evals/taskbond-gauntlet-redteam.jsonl",
    });
    expect(scorecard.fail).toBe(0);
    expect(scorecard.pass).toBe(cases.length);
    expect(cases.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        "rt_obfuscated_forbidden_01",
        "rt_ignore_mandates_workflows_01",
        "rt_eu_nis2_crypto_01",
        "rt_intent_too_long_01",
        "rt_too_many_files_01",
        "rt_outcome_approve_injection_01",
      ]),
    );
  });

  it("eu-nis2-cra legal_space forbids crypto that none allows", () => {
    const none = runTaskBondGauntlet(
      [
        {
          id: "none-crypto",
          category: "redteam",
          depth: 3,
          legal_space: "none",
          intent: "Touch crypto",
          boundFiles: ["src/crypto/keys.ts"],
          expect: { ok: true },
        },
      ],
      ".",
    );
    const eu = runTaskBondGauntlet(
      [
        {
          id: "eu-crypto",
          category: "redteam",
          depth: 3,
          legal_space: "eu-nis2-cra",
          intent: "Touch crypto",
          boundFiles: ["src/crypto/keys.ts"],
          expect: { ok: false, reason: "forbidden_prefix" },
        },
      ],
      ".",
    );
    expect(none.fail).toBe(0);
    expect(eu.fail).toBe(0);
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
