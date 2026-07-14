#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import * as path from "node:path";
import { parseOrchestratorIntent } from "../constitution/parse.js";
import {
  intentToPacket,
  listDetectedAgents,
  routeIntent,
  runTroubleshootDag,
} from "./troubleshoot.js";

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(`Usage:
  npm run orchestrate -- troubleshoot "<symptom>"
  npm run orchestrate -- route --intent "<symptom>"
  npm run orchestrate -- agents`);
    process.exit(0);
  }

  if (command === "agents") {
    console.log(JSON.stringify(listDetectedAgents(rootDir), null, 2));
    return;
  }

  if (command === "route") {
    const intentFlag = rest.indexOf("--intent");
    const symptom =
      intentFlag >= 0 ? rest.slice(intentFlag + 1).join(" ") : rest.join(" ");
    if (!symptom.trim()) {
      console.error("route requires --intent <text>");
      process.exit(1);
    }
    const intent = parseOrchestratorIntent({
      action: "route",
      symptom: symptom.trim(),
    });
    console.log(JSON.stringify(routeIntent(intent, rootDir), null, 2));
    return;
  }

  if (command === "troubleshoot") {
    const symptom = rest.join(" ").trim();
    if (!symptom) {
      console.error("troubleshoot requires a symptom string");
      process.exit(1);
    }

    const intent = parseOrchestratorIntent({
      action: "troubleshoot",
      symptom,
      title: symptom,
    });
    const packet = intentToPacket(intent, rootDir);

    const outcome = await runTroubleshootDag(packet, {
      rootDir,
      actor: "cli",
      trustCheck: () => {
        const script = path.join(rootDir, "scripts", "ai-trust-check.sh");
        try {
          execSync(`bash "${script}"`, { cwd: rootDir, stdio: "pipe" });
        } catch (error: unknown) {
          const message =
            error && typeof error === "object" && "stderr" in error
              ? String((error as { stderr?: Buffer }).stderr ?? "")
              : error instanceof Error
                ? error.message
                : "trust check failed";
          throw new Error(message || "ai-trust-check failed");
        }
      },
    });

    console.log(outcome.cockpit);
    process.exit(outcome.heal.healed ? 0 : 1);
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
