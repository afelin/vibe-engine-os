import {
  exportSchemas,
  printPersonaQuickstart,
  runActivateChecks,
  smokeMcpHandlers,
  writeActivatedJson,
} from "./check.js";
import { exportAgentAdapter } from "../launch/agent-adapter.js";
import { runLaunchReadiness } from "../launch/readiness.js";
import { createVowAttestation } from "../constitution/vows.js";
import { loadActiveStack } from "../policy/stackables.js";
import { writeCorewardModeConfig } from "../coreward/mode.js";
import { renderGovernanceStrip } from "./visibility.js";

const argv = process.argv.slice(2);
const governed = argv.includes("--governed");
const rootDir = argv.find((a) => !a.startsWith("-")) ?? ".";

const checks = runActivateChecks(rootDir);
if (checks.errors.length > 0) {
  console.error("Activation checks failed:");
  for (const error of checks.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

const mcpSmoke = smokeMcpHandlers();
if (!mcpSmoke.pass) {
  console.error("MCP smoke failed");
  process.exit(1);
}

if (governed) {
  writeCorewardModeConfig(rootDir, { enabled: true });
  console.log("✓ Coreward Mode ON (--governed)");
  console.log(
    "  Mandate keys (never silent): set VIBE_MANDATE_PRIVATE_KEY + VIBE_MANDATE_PUBLIC_KEY",
  );
  console.log(
    "  Then: npm run mandate:issue && npm run ward:doctor  (Ward stays LEGACY until keys + Mandate)",
  );
}

const attestation = createVowAttestation(rootDir);
const schemasPath = exportSchemas(rootDir);
const adapterPath = exportAgentAdapter(rootDir);
const launchReadiness = runLaunchReadiness(rootDir);

const activatedPath = writeActivatedJson(rootDir, {
  activatedAt: attestation.attestedAt,
  vowsHash: attestation.vowsHash,
  schemaVersion: attestation.vowsVersion,
  gateSmokePass: mcpSmoke.pass,
  checkPass: true,
  launchReadiness: launchReadiness.ok ? "pass" : "fail",
});

const activeSpace = loadActiveStack(rootDir)?.legalSpace ?? "none";
const strip = renderGovernanceStrip(rootDir);

console.log(`✓ Schemas exported: ${schemasPath}`);
console.log(`✓ Agent adapter: ${adapterPath}`);
console.log(`✓ MCP smoke: ${mcpSmoke.gateCount} gates`);
console.log(
  launchReadiness.ok
    ? "✓ Launch readiness: pass"
    : "⚠ Launch readiness: fail (run npm run launch:readiness)",
);
console.log(`✓ Activated: ${activatedPath}`);
console.log(`✓ Active legal space: ${activeSpace}`);
console.log(`✓ ${strip}`);
printPersonaQuickstart();
console.log("");
console.log("Next: npm run bootstrap — MCP/skill install snippets → .vibe/bootstrap-snippets.json");
console.log("      npm run coreward:init — Node + Mode + light smoke + operate URL");
if (!governed) {
  console.log("      Tip: npm run activate -- --governed  (Coreward Mode ON + Mandate key hints)");
}
