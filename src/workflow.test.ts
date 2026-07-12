import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("GitHub Actions workflow", () => {
  it("reads run id from artifact metadata instead of ls", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain(".runs/run-id.txt");
    expect(workflow).not.toContain("grep -v idempotency");
  });

  it("posts promotion gate on pushed branch head sha", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("Post promotion gate on branch head");
    expect(workflow).toContain("VIBE_HEAD_SHA=$(git rev-parse HEAD)");
    expect(workflow).toContain("VIBE_SKIP_CHECK");
    expect(workflow).toContain("VIBE_CHECK_ONLY");
    expect(workflow.indexOf("git rev-parse HEAD")).toBeLessThan(
      workflow.indexOf("Post promotion gate on branch head"),
    );
  });

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

  it("runs the replay determinism gate before promotion apply", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("Replay determinism gate");
    expect(workflow).toContain("npm run replay");
    expect(workflow).toContain("events.ndjson");
    expect(workflow.indexOf("npm run replay")).toBeLessThan(
      workflow.indexOf("promote:apply"),
    );
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

  it("audits Assisted-by attribution on pull requests to main", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/tdd-attribution.yml"),
      "utf8",
    );

    expect(workflow).toContain("pull_request");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("scripts/audit-attribution.mjs");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("name: Audit Assisted-by attribution");
  });

  it("self-attributes engine-generated promotion commits", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("Assisted-by: vibe-engine-os");
  });

  it("wires optional auto-merge when CI is green", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/vibe-auto-merge.yml"),
      "utf8",
    );

    expect(workflow).toContain("pull_request");
    expect(workflow).toContain("check_suite");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("checks: read");
    expect(workflow).toContain("pr:auto-merge");
    expect(workflow).toContain("VIBE_AUTO_MERGE");
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

  it("auto-creates PR when missing after git sync", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("Ensure PR exists");
    expect(workflow).toContain("scripts/create-pr.mjs");
    expect(workflow).toContain(".runs/pr-url.txt");
    expect(workflow).toContain("VIBE_PR_URL");
    expect(workflow.indexOf("Git sync and PR")).toBeLessThan(
      workflow.indexOf("Ensure PR exists"),
    );
  });

  it("gates deploy-from-capsule on VIBE_DEPLOY variable", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("vibe-deploy:");
    expect(workflow).toContain("vars.VIBE_DEPLOY == '1'");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("Validate capsule for deploy");
    expect(workflow).toContain("Deploy from capsule (placeholder)");
    expect(workflow).toContain(".runs/run-id.txt");
  });

  it("exposes deploy_after_validate on composite action", () => {
    const action = fs.readFileSync(
      path.join(process.cwd(), "action.yml"),
      "utf8",
    );

    expect(action).toContain("deploy_after_validate");
    expect(action).toContain('default: "false"');
    expect(action).toContain("Deploy placeholder (opt-in)");
  });

  it("tells nocode users they get PR and receipt in issue template", () => {
    const template = fs.readFileSync(
      path.join(process.cwd(), ".github/ISSUE_TEMPLATE/vibe-request.yml"),
      "utf8",
    );

    expect(template).toContain(
      "You'll get a PR link and receipt in comments—no terminal required.",
    );
  });

  it("updates cockpit comment with PR link after promotion", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/forever.yml"),
      "utf8",
    );

    expect(workflow).toContain("Update cockpit with PR link");
    expect(workflow).toContain("publish-pr-cockpit.ts");
    expect(workflow.indexOf("Ensure PR exists")).toBeLessThan(
      workflow.indexOf("Update cockpit with PR link"),
    );
  });

  it("wires cockpit receipt links through hpurl primitives", () => {
    const cockpitSource = fs.readFileSync(
      path.join(process.cwd(), "src/operator/cockpit.ts"),
      "utf8",
    );

    expect(cockpitSource).toContain("buildProofHpurl");
    expect(cockpitSource).toContain("resolvePrUrl");
    expect(cockpitSource).toContain("prUrl");
    expect(fs.existsSync(path.join(process.cwd(), "proof/index.html"))).toBe(true);
  });
});
