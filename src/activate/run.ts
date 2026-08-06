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

const rootDir = process.argv[2] ?? ".";

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
printPersonaQuickstart();
console.log("");
console.log("Next: npm run bootstrap — MCP/skill install snippets → .vibe/bootstrap-snippets.json");
