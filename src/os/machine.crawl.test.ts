import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { listReleaseGateIds, loadGateDefinitions } from "../release-gate/registry.js";
import { crawlMachine, renderOsPhasesMarkdown } from "./crawl.js";
import { createInitialOSContext, createOSMachine } from "./machine.js";

const EXPECTED_PHASES = [
  "awaiting_approval",
  "completed",
  "failed",
  "generating_patch",
  "learning",
  "planning",
  "preflight",
  "publishing",
  "received",
  "risk_review",
  "verifying",
];

describe("OS machine crawl proof", () => {
  it("visits every promotion phase in the machine graph", () => {
    const machine = createOSMachine(createInitialOSContext());
    const crawl = crawlMachine(machine);

    for (const phase of EXPECTED_PHASES) {
      expect(crawl.phases).toContain(phase);
    }
  });

  it("assigns meta.phase to every atomic machine state", () => {
    const machine = createOSMachine(createInitialOSContext());
    const machinePrefix = `${machine.id}.`;

    for (const [stateKey, stateNode] of Object.entries(machine.states)) {
      const shortKey = stateKey.startsWith(machinePrefix)
        ? stateKey.slice(machinePrefix.length)
        : stateKey;
      const meta = (stateNode as { meta?: { phase?: string } }).meta;
      expect(meta?.phase, `missing phase for ${shortKey}`).toBe(shortKey);
    }
  });

  it("maps every release gate id to a registry entry", () => {
    const gateIds = listReleaseGateIds();
    expect(gateIds).toContain("cloud-loop-smoke");
    expect(gateIds).toContain("pr-review-smoke");
    expect(gateIds.length).toBeGreaterThanOrEqual(10);
  });

  it("maps every gate id to a skill in .skills/actors/", () => {
    const definitions = loadGateDefinitions();
    const skillsDir = path.join(process.cwd(), ".skills/actors");

    for (const gate of definitions) {
      const skillPath = path.join(skillsDir, `${gate.id}.ts`);
      const altNames: Record<string, string> = {
        "cloud-loop-smoke": "cloud-loop-smoke.ts",
      };
      const expected = altNames[gate.id] ?? `${gate.id}.ts`;
      const resolved = path.join(skillsDir, expected);
      expect(
        fs.existsSync(skillPath) || fs.existsSync(resolved),
        `missing skill for gate ${gate.id}`,
      ).toBe(true);
    }
  });

  it("matches committed docs/os-phases.md", () => {
    const machine = createOSMachine(createInitialOSContext());
    const rendered = renderOsPhasesMarkdown(machine);
    const docPath = path.join(process.cwd(), "docs/os-phases.md");

    if (!fs.existsSync(docPath)) {
      fs.mkdirSync(path.dirname(docPath), { recursive: true });
      fs.writeFileSync(docPath, rendered);
    }

    expect(fs.readFileSync(docPath, "utf8")).toBe(rendered);
  });
});
