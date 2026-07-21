#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import * as path from "node:path";
import { parseOrchestratorIntent } from "../constitution/parse.js";
import {
  parseHealMaxLevel,
  type HealMaxLevel,
} from "./heal.js";
import {
  intentToPacket,
  listDetectedAgents,
  routeIntent,
  runTroubleshootDag,
} from "./troubleshoot.js";

function resolveHealFlags(argv: string[]): {
  skipLlm: boolean;
  maxLevel?: HealMaxLevel;
  args: string[];
} {
  const envSkip =
    process.env.ORCHESTRATOR_SKIP_LLM === "1" ||
    process.env.ORCHESTRATOR_SKIP_LLM === "true";
  const flagSkip = argv.includes("--skip-llm");

  let maxLevel = parseHealMaxLevel(process.env.VIBE_HEAL_MAX_LEVEL);
  const maxIdx = argv.indexOf("--max-level");
  const filtered: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--skip-llm") continue;
    if (arg === "--max-level") {
      const next = argv[i + 1];
      const parsed = parseHealMaxLevel(next);
      if (parsed !== undefined) {
        maxLevel = parsed;
        i++;
        continue;
      }
    }
    if (arg.startsWith("--max-level=")) {
      const parsed = parseHealMaxLevel(arg.slice("--max-level=".length));
      if (parsed !== undefined) {
        maxLevel = parsed;
        continue;
      }
    }
    filtered.push(arg);
  }

  return {
    skipLlm: envSkip || flagSkip,
    maxLevel,
    args: filtered,
  };
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(`Usage:
  npm run orchestrate -- troubleshoot "<symptom>" [--skip-llm] [--max-level 0|1|2|3]
  npm run orchestrate -- route --intent "<symptom>"
  npm run orchestrate -- agents

Env:
  ORCHESTRATOR_SKIP_LLM=1  skip L2+ LLM (same as --skip-llm / maxLevel 1)
  VIBE_HEAL_MAX_LEVEL=0|1|2|3  cap heal ladder (default 3 = full ladder)`);
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
    const { skipLlm, maxLevel, args } = resolveHealFlags(rest);
    const symptom = args.join(" ").trim();
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
      skipLlm,
      maxLevel,
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
