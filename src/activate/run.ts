import {
  exportSchemas,
  printPersonaQuickstart,
  runActivateChecks,
  smokeMcpHandlers,
  writeActivatedJson,
} from "./check.js";
import { createVowAttestation } from "../constitution/vows.js";

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

const activatedPath = writeActivatedJson(rootDir, {
  activatedAt: attestation.attestedAt,
  vowsHash: attestation.vowsHash,
  schemaVersion: attestation.vowsVersion,
  gateSmokePass: mcpSmoke.pass,
  checkPass: true,
});

console.log(`✓ Schemas exported: ${schemasPath}`);
console.log(`✓ MCP smoke: ${mcpSmoke.gateCount} gates`);
console.log(`✓ Activated: ${activatedPath}`);
printPersonaQuickstart();
