import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type GeneratedPatchFile = { path: string; content: string };

export type ReleaseGateMatch = {
  id: string;
  planLines: string[];
  files: GeneratedPatchFile[];
};

type SmokeTestSpec = {
  moduleBase: string;
  exportName: string;
  token: string;
};

type GateFileSpec =
  | { path: string; content: string }
  | { path: string; smokeTest: SmokeTestSpec };

type GateMatchRule =
  | { allIncludes: string[] }
  | { titleOrBodyIncludesLower: string[] };

type GateDefinition = {
  id: string;
  planLines: string[];
  match: GateMatchRule[];
  files: GateFileSpec[];
};

type GateRegistry = {
  version: number;
  gates: GateDefinition[];
};

const registryDir = dirname(fileURLToPath(import.meta.url));

export function vitestSmokeTest(
  moduleBase: string,
  exportName: string,
  token: string,
): string {
  return [
    'import { describe, expect, it } from "vitest";',
    `import { ${exportName} } from "./${moduleBase}.js";`,
    "",
    `describe("${moduleBase.replace(/-/g, " ")}", () => {`,
    '  it("exports the v1 status token", () => {',
    `    expect(${exportName}).toBe("${token}");`,
    "  });",
    "});",
    "",
  ].join("\n");
}

function compileFile(file: GateFileSpec): GeneratedPatchFile {
  if ("content" in file) {
    return { path: file.path, content: file.content };
  }

  const { moduleBase, exportName, token } = file.smokeTest;
  return {
    path: file.path,
    content: vitestSmokeTest(moduleBase, exportName, token),
  };
}

function compileGate(gate: GateDefinition): ReleaseGateMatch {
  return {
    id: gate.id,
    planLines: gate.planLines,
    files: gate.files.map(compileFile),
  };
}

function readRegistry(): GateRegistry {
  const raw = readFileSync(join(registryDir, "gates.json"), "utf8");
  return JSON.parse(raw) as GateRegistry;
}

let cachedGates: ReleaseGateMatch[] | null = null;

export function loadReleaseGates(): ReleaseGateMatch[] {
  if (!cachedGates) {
    cachedGates = readRegistry().gates.map(compileGate);
  }
  return cachedGates;
}

export function listReleaseGateIds(): string[] {
  return loadReleaseGates().map((gate) => gate.id);
}

function ruleMatches(rule: GateMatchRule, title: string, body: string): boolean {
  const spec = `${title}\n${body}`;
  const specLower = spec.toLowerCase();

  if ("allIncludes" in rule) {
    return rule.allIncludes.every((needle) => spec.includes(needle));
  }

  return rule.titleOrBodyIncludesLower.some((needle) =>
    specLower.includes(needle),
  );
}

export function gateMatches(
  gate: ReleaseGateMatch,
  definition: GateDefinition,
  title: string,
  body: string,
): boolean {
  return definition.match.some((rule) => ruleMatches(rule, title, body));
}

export function loadGateDefinitions(): GateDefinition[] {
  return readRegistry().gates;
}

export function resolveGateFromRegistry(
  title: string,
  body: string,
): ReleaseGateMatch | null {
  const definitions = loadGateDefinitions();
  const gates = loadReleaseGates();

  for (let index = 0; index < definitions.length; index += 1) {
    if (gateMatches(gates[index], definitions[index], title, body)) {
      return gates[index];
    }
  }

  return null;
}
