/**
 * Published zero-build MCP entry (`npx -y @coreward/mcp`).
 * Honors COREWARD_ROOT (else cwd) as the target repo for root_dir defaults.
 */
import { startReleaseGateMcpServer } from "../../../src/release-gate/mcp.js";

const root = process.env.COREWARD_ROOT?.trim();
if (root) {
  process.chdir(root);
}

startReleaseGateMcpServer();
