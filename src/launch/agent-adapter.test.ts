import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentAdapterManifest } from "./agent-adapter.js";

describe("buildAgentAdapterManifest", () => {
  it("includes contract.blocks_promotion and stackables", () => {
    const manifest = buildAgentAdapterManifest(".");
    expect(manifest.version).toBe("2.0.0");
    expect(manifest.brand).toBe("Coreward");
    expect(manifest.required_tools).toContain("preflight");
    expect(manifest.mcp_server).toBe("coreward-release-gates");
    expect(manifest.contract.blocks_promotion.length).toBeGreaterThan(0);
    expect(manifest.contract.blocks_promotion).toContain("mandate_violation");
    expect(manifest.contract.call_order.preflight).toEqual(["preflight"]);
    expect(manifest.contract.call_order.postrun).toContain("validate_capsule");
    expect(manifest.preflight_tools).toContain("authorize_write");
    expect(manifest.preflight_tools).toContain("preflight");
    expect(manifest.contract.expect.on_success.length).toBeGreaterThan(0);
    expect(manifest.contract.expect.on_failure.length).toBeGreaterThan(0);
    expect(manifest.contract.stackables?.legal_spaces).toContain("none");
    expect(manifest.contract.stackables?.project_profiles).toContain("tabdab");
  });
});

describe("coreward skill", () => {
  it("vows preflight once and points at operate docs", () => {
    const skill = fs.readFileSync(
      path.join(".cursor/skills/coreward/SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("preflight");
    expect(skill).toMatch(/Call MCP \*\*`preflight`\*\*/i);
    expect(skill).toContain("/go");
    expect(skill).toContain("docs/operate.md");
  });

  it("mentions cyberready_validate_delta when CyberReady present", () => {
    const skill = fs.readFileSync(
      path.join(".cursor/skills/coreward/SKILL.md"),
      "utf8",
    );
    expect(skill).toMatch(/When CyberReady present/i);
    expect(skill).toContain("cyberready_validate_delta");
  });
});
