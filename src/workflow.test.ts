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

  it("skips artifact upload for operator-only commands", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("VIBE_OPERATOR_ONLY != '1'");
    expect(workflow).toContain("vibe-promote");
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

  it("routes pull_request_review into PR feedback context with empty-body fallback", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("pull_request_review");
    expect(workflow).toContain("pull_request_review_comment");
    expect(workflow).toContain("types: [submitted, edited]");
    expect(workflow).toContain("types: [created, edited]");
    expect(workflow).toContain('github.event_name }}" == "pull_request_review_comment"');
    expect(workflow).toContain("BODY_REVIEW");
    expect(workflow).toContain("github.event.pull_request.number");
    expect(workflow).toContain("(PR Feedback)");
    expect(workflow).toContain("src/pr-review-smoke.ts");
    expect(workflow).toContain('if [ -z "$REVIEW_BODY" ]; then');
  });

  it("gates agent runs on vibe/run label and operator commands", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("vibe/run");
    expect(workflow).toContain("/vibe");
    expect(workflow).toContain("gate-check");
    expect(workflow).toContain("should_run");
  });

  it("uses thin promote job with artifact upload/download", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("actions/download-artifact@v4");
    expect(workflow).toContain("gate:validate-capsule");
  });

  it("wires approver allowlist secret into the agent job", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("VIBE_APPROVERS: ${{ secrets.VIBE_APPROVERS }}");
  });

  it("promote job depends on gate-check for issue number context", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toMatch(/vibe-promote:\s*\n\s*needs:\s*\[gate-check,\s*vibe-run\]/);
    expect(workflow).toContain(
      "needs.gate-check.outputs.issue_number",
    );
  });

  it("stages only manifest-listed files in promote job", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("promote:apply");
    expect(workflow).toContain("generatedFiles.forEach");
    expect(workflow).toContain('git add "$file_path"');
    expect(workflow).not.toContain("git add src/");
    expect(workflow).not.toContain("git add .");
  });

  it("runs bond preflight before promotion apply", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("bond:preflight");
    expect(workflow.indexOf("bond:preflight")).toBeLessThan(
      workflow.indexOf("promote:apply"),
    );
  });

  it("defaults subgraph vitest for depth >= 3 in CI", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("VIBE_TEST_MODE=subgraph");
    expect(workflow).toContain('if [ "$DEPTH" -ge 3 ]');
    expect(workflow).toContain("vibe:ship");
  });

  it("uses structured gate failure feedback in the runtime ratchet", () => {
    const runSource = fs.readFileSync(
      path.join(process.cwd(), "src/os/run.ts"),
      "utf8",
    );

    expect(runSource).toContain("formatGateFailuresMarkdown");
    expect(runSource).toContain("gateFailures");
    expect(runSource).toContain("createGateFailure");
  });
});
