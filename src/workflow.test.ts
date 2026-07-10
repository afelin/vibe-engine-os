import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("GitHub Actions workflow", () => {
  it("installs project dependencies before running the agent", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    const installIndex = workflow.indexOf("bun install");
    const agentIndex = workflow.indexOf("bun run agent.ts");

    expect(installIndex).toBeGreaterThan(-1);
    expect(agentIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeLessThan(agentIndex);
  });

  it("skips deploy and handoff for operator-only commands", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow.match(/VIBE_OPERATOR_ONLY != '1'/g)).toHaveLength(3);
    expect(workflow).toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });

  it("keeps issue_comment context assembly inside the shell block", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain(
      'COMMENT_CONTEXT=$(printf \'Operator comment:\\n%s\\n\\nOriginal issue:\\n%s\' "$BODY_COMMENT" "$BODY_ISSUE")',
    );
    expect(workflow).not.toMatch(/\n\$BODY_COMMENT\n\nOriginal issue:/);
  });
});
