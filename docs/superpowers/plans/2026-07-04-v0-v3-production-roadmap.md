# V0-V3 Production Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `vibe-engine-os` as a low-maintenance, no-code-safe autonomous delivery runtime in staged layers instead of attempting the full recursive architecture at once.

**Architecture:** V0 stabilizes the current GitHub Actions agent, V1 adds xmachines/DAG governance and reversible no-code controls, V2 adds structured learning with Pearl-style traces and LCM-lite memory, and V3 distributes the runtime across Cloudflare and Oracle Free Tier. The system follows the nanochat taste profile: one clear dial, complete loop, tight evals, repeatable scripts, and measurable scoreboards.

**Tech Stack:** TypeScript ESM, Vitest, XState/xmachines, GitHub Actions, GitHub issues/comments/labels, append-only JSONL, generated Markdown reports, later Cloudflare Workers/D1/Queues and Oracle Free Tier runner.

---

## Premortem-Driven Scope

The maximal plan is directionally right but too large for the first production pass. The likely failure mode is overbuilding Pearl, LCM, Cloudflare, Oracle, generated wiki, and meta-agent learning before the current repo has a trustworthy local/GitHub execution spine.

This staged roadmap keeps the covenant but narrows the first slice:

```text
V0: Stabilize current runner
V1: Govern mutations with xmachines, DAGs, validators, approvals, rollback
V2: Learn from runs with structured memory, scorecards, and causal traces
V3: Distribute safely across Cloudflare and Oracle
```

The product promise for no-code users is:

> Every change is visible, risk-classified, tested, and reversible. The system never silently traps the user.

## V0: Stabilize

**Goal:** Make the current repo and GitHub Actions runner boring, testable, and recoverable before adding architecture.

**What ships:**
- Existing `agent.ts` hardening remains.
- Baseline TypeScript/Vitest project remains.
- Workflow crash/fallback behavior remains.
- Add smoke scripts and a minimal no-code status report.
- Add rollback metadata for every generated patch.

### V0 Tasks

#### Task V0.1: Preserve The Current Hardening Baseline

**Files:**
- Keep: `agent.ts`
- Keep: `.github/workflows/forever.yml`
- Keep: `package.json`
- Keep: `tsconfig.json`
- Keep: `src/index.ts`
- Keep: `src/index.test.ts`

- [ ] Confirm `agent.ts` has a global `uncaughtException` handler and `runOS().catch(...)` exits non-zero on fatal failure.
- [ ] Confirm `.github/workflows/forever.yml` has no `git repack --write-midx=incremental`.
- [ ] Confirm Cloudflare deploy failure exports `PREVIEW_URL=cloudflare-failed.local` and does not fail the PR handoff.
- [ ] Confirm multi-line GitHub issue/comment/review bodies are written to `$GITHUB_ENV` with generated delimiters.

Run:

```bash
npm test
npx tsc --noEmit
```

Expected: Vitest passes and TypeScript exits with code 0.

#### Task V0.2: Add Canonical Local Smoke Scripts

**Files:**
- Create: `runs/smoke.sh`
- Create: `runs/local-issue.sh`
- Modify: `package.json`

- [ ] Add package scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "check": "tsc --noEmit && vitest run",
    "smoke": "bash runs/smoke.sh",
    "local-issue": "bash runs/local-issue.sh"
  }
}
```

- [ ] Create `runs/smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

npm test
npx tsc --noEmit
```

- [ ] Create `runs/local-issue.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

export ISSUE_NUMBER="${ISSUE_NUMBER:-000}"
export ISSUE_TITLE="${ISSUE_TITLE:-Local Smoke Issue}"
export ISSUE_BODY="${ISSUE_BODY:-Run local Vibe Engine smoke path.}"

bun run agent.ts
```

Run:

```bash
npm run check
npm run smoke
```

Expected: both commands exit 0.

#### Task V0.3: Add Run Metadata And Rollback Manifest

**Files:**
- Create: `src/run/manifest.ts`
- Test: `src/run/manifest.test.ts`

- [ ] Implement manifest writer:

```ts
import * as fs from "fs";
import * as path from "path";

export type RunManifest = {
  runId: string;
  issueNumber: string;
  issueTitle: string;
  branchName: string;
  baseSha: string;
  generatedFiles: string[];
  createdAt: string;
};

export function writeRunManifest(rootDir: string, manifest: RunManifest) {
  const dir = path.join(rootDir, ".runs", manifest.runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export function renderRollbackInstructions(manifest: RunManifest) {
  return [
    `# Rollback ${manifest.runId}`,
    "",
    `Branch: ${manifest.branchName}`,
    `Base SHA: ${manifest.baseSha}`,
    "",
    "To inspect the change:",
    "",
    "```bash",
    `git diff ${manifest.baseSha}..HEAD`,
    "```",
    "",
    "To return to the base commit on this branch after review:",
    "",
    "```bash",
    `git revert --no-edit ${manifest.baseSha}..HEAD`,
    "```",
    "",
  ].join("\n");
}
```

- [ ] Test it:

```ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { renderRollbackInstructions, writeRunManifest } from "./manifest.js";

describe("run manifest", () => {
  it("writes rollback metadata", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-run-"));
    writeRunManifest(root, {
      runId: "run_001",
      issueNumber: "1",
      issueTitle: "Test",
      branchName: "vibe/issue-1",
      baseSha: "abc123",
      generatedFiles: ["src/index.ts"],
      createdAt: "2026-07-04T00:00:00.000Z",
    });

    expect(fs.existsSync(path.join(root, ".runs", "run_001", "manifest.json"))).toBe(true);
  });

  it("renders rollback instructions with base sha", () => {
    const text = renderRollbackInstructions({
      runId: "run_001",
      issueNumber: "1",
      issueTitle: "Test",
      branchName: "vibe/issue-1",
      baseSha: "abc123",
      generatedFiles: [],
      createdAt: "2026-07-04T00:00:00.000Z",
    });

    expect(text).toContain("abc123");
    expect(text).toContain("git diff");
  });
});
```

Run:

```bash
npm run check
```

Expected: all tests pass.

## V1: Govern

**Goal:** Add the production safety spine: xmachines authority, typed DAG plans, protected-file policy, deterministic validators, slash commands, cockpit comments, and approval gates.

**What ships:**
- `agent.ts` becomes a thin entrypoint.
- OS lifecycle is explicit in XState/xmachines.
- Every plan becomes a DAG.
- Every mutation is risk-classified.
- High-risk changes pause for `/approve`.
- No-code user sees a cockpit comment and rollback path.

### V1 Tasks

#### Task V1.1: Introduce xmachines/XState Lifecycle

**Files:**
- Modify: `package.json`
- Create: `src/os/events.ts`
- Create: `src/os/machine.ts`
- Create: `src/os/run.ts`
- Modify: `agent.ts`
- Test: `src/os/machine.test.ts`

- [ ] Add dependencies:

```json
{
  "dependencies": {
    "@xmachines/play-xstate": "latest",
    "xstate": "latest"
  }
}
```

- [ ] Define lifecycle states:

```text
received -> preflight -> planning -> risk_review
risk_review -> awaiting_approval | generating_patch
generating_patch -> verifying -> publishing -> completed
verifying -> learning -> preflight
any unrecoverable failure -> failed
```

- [ ] Define core events:

```ts
export type RiskLevel = "low" | "medium" | "high";

export type OSEvent =
  | { type: "os.received"; source: "github" | "cloudflare"; payload: unknown }
  | { type: "preflight.completed"; findings: PreflightFinding[] }
  | { type: "plan.created"; dag: ExecutionDag }
  | { type: "risk.reviewed"; risk: RiskLevel; reason: string }
  | { type: "approval.granted"; actor: string }
  | { type: "patch.generated"; files: GeneratedFile[] }
  | { type: "verification.passed"; results: VerificationResult[] }
  | { type: "verification.failed"; failure: ClassifiedFailure }
  | { type: "learning.recorded"; lessonIds: string[] }
  | { type: "publish.completed"; prUrl?: string; previewUrl?: string };
```

- [ ] Test high-risk approval pause and verification failure learning transition.

Run:

```bash
npm run check
```

Expected: machine tests pass and TypeScript exits 0.

#### Task V1.2: Add Typed DAG Planning

**Files:**
- Create: `src/planning/dag.ts`
- Test: `src/planning/dag.test.ts`

- [ ] Add DAG types:

```ts
export type DagNodeKind =
  | "research"
  | "edit"
  | "test"
  | "verify"
  | "publish"
  | "learn";

export type ExecutionDagNode = {
  id: string;
  title: string;
  kind: DagNodeKind;
  dependsOn: string[];
  risk: RiskLevel;
  files: string[];
  acceptance: string[];
};

export type ExecutionDag = {
  issueNumber: string;
  title: string;
  nodes: ExecutionDagNode[];
};
```

- [ ] Implement validators for missing dependencies and cycles.
- [ ] Implement topological sort.
- [ ] Test valid DAG, missing dependency, and cycle rejection.

Run:

```bash
npm run check
```

Expected: DAG tests pass.

#### Task V1.3: Add File Policy And Validators

**Files:**
- Create: `src/verification/policy.ts`
- Create: `src/verification/validators.ts`
- Test: `src/verification/validators.test.ts`

- [ ] Implement two policy modes:

```ts
export type PolicyMode = "generated_patch" | "maintainer_change";
```

- [ ] For `generated_patch`, allow only:

```text
src/**
tests/**
.planning/**
.skills/**
```

- [ ] For `maintainer_change`, allow planned repo maintenance paths but still require approval for:

```text
.github/**
package.json
package-lock.json
bun.lockb
*.env
```

- [ ] Add validators:
  - schema-valid generated file list
  - no path traversal
  - policy allowlist
  - protected-file approval required
  - local ESM imports use `.js`

Run:

```bash
npm run check
```

Expected: validators pass and policy conflict from the maximal plan is resolved.

#### Task V1.4: Add No-Code Cockpit And Slash Commands

**Files:**
- Create: `src/operator/commands.ts`
- Create: `src/operator/cockpit.ts`
- Test: `src/operator/commands.test.ts`

- [ ] Support slash commands:

```text
/plan
/approve
/retry
/rollback
/status
/deploy
```

- [ ] Render cockpit comment with:
  - current state
  - issue
  - vibe depth
  - DAG progress
  - changed files
  - latest error
  - rollback pointer
  - available commands

Run:

```bash
npm run check
```

Expected: command parser tests pass.

## V2: Learn

**Goal:** Add structured recursivity without pretending the system has enough data for grand claims. V2 records high-quality traces and uses simple retrieval before planning.

**What ships:**
- Structured EvoMem.
- LCM-lite append-only memory.
- Failure classifier.
- Scorecards.
- Pearl-style intervention logs.
- Generated human-readable summaries.

### V2 Tasks

#### Task V2.1: Add Structured EvoMem

**Files:**
- Create: `src/memory/evomem.ts`
- Test: `src/memory/evomem.test.ts`
- Runtime dirs: `.evomem/events/`, `.evomem/lessons/`, `.evomem/scorecards/`

- [ ] Store lessons as JSON:

```ts
export type EvoLesson = {
  id: string;
  failureClass:
    | "compile"
    | "test"
    | "dependency"
    | "api_drift"
    | "permission"
    | "cloud_deploy"
    | "model_output"
    | "invariant"
    | "operator_intent";
  symptom: string;
  rootCause: string;
  fix: string;
  detector: string;
  confidence: number;
  reuseWhen: string[];
  createdAt: string;
};
```

- [ ] Append every lesson event to daily JSONL.
- [ ] Generate `EVOMEM.md` from JSON lessons.

Run:

```bash
npm run check
```

Expected: memory tests pass.

#### Task V2.2: Add LCM-Lite Raw Memory

**Files:**
- Create: `src/memory/raw-store.ts`
- Create: `src/memory/retrieval.ts`
- Test: `src/memory/retrieval.test.ts`
- Runtime dirs: `.memory/raw/`, `.memory/index/`

- [ ] Append raw run events:

```ts
export type RawMemoryEvent = {
  id: string;
  runId: string;
  kind: "prompt" | "tool" | "validator" | "operator" | "patch" | "publish";
  content: unknown;
  createdAt: string;
};
```

- [ ] Implement retrieval by:
  - failure class
  - detector name
  - touched path prefix
  - latest successful patch for similar path

- [ ] Defer full summary DAG until V3 or later. V2 only needs append-only raw memory plus simple indexes.

Run:

```bash
npm run check
```

Expected: raw memory and retrieval tests pass.

#### Task V2.3: Add Pearl-Style Traces And Scorecards

**Files:**
- Create: `src/research/traces.ts`
- Create: `src/research/interventions.ts`
- Create: `src/research/scorecard.ts`
- Test: `src/research/scorecard.test.ts`

- [ ] Record trace spans:

```ts
export type TraceSpan = {
  runId: string;
  phase: string;
  promptTemplateId?: string;
  model?: string;
  inputContextIds: string[];
  validatorResults: Array<{ name: string; passed: boolean }>;
  reward: number;
  durationMs: number;
  costEstimateUsd: number;
  outcome: "passed" | "failed" | "blocked";
  createdAt: string;
};
```

- [ ] Record interventions:

```ts
export type InterventionRecord = {
  id: string;
  runId: string;
  intervention: string;
  targetMetric:
    | "first_pass_success"
    | "retry_count"
    | "rollback_count"
    | "time_to_green"
    | "cost_per_green_pr";
  createdAt: string;
};
```

- [ ] Compute scorecards:
  - run count
  - pass/fail/blocked count
  - first-pass success rate
  - average retry count
  - rollback count
  - average cost estimate

- [ ] Do not expose causal confidence yet. V2 records interventions and outcomes; confidence estimates wait for enough data.

Run:

```bash
npm run check
```

Expected: scorecard tests pass.

## V3: Distribute

**Goal:** Move from a GitHub Actions-only runner to a resilient Cloudflare + Oracle architecture after the local/GitHub spine is reliable.

**What ships:**
- Cloudflare Worker intake.
- D1 status projection.
- Queue dispatch.
- Oracle runner daemon.
- GitHub Actions fallback.
- Sleep/wake triggers.
- Generated operator wiki and status pages.

### V3 Tasks

#### Task V3.1: Add Cloudflare Adapters

**Files:**
- Create: `src/cloudflare/intake.ts`
- Create: `src/cloudflare/status.ts`
- Create: `src/cloudflare/queue.ts`
- Test: `src/cloudflare/intake.test.ts`

- [ ] Normalize GitHub webhook payloads into jobs.
- [ ] Create deterministic idempotency keys:

```text
github:{eventName}:{deliveryId}
```

- [ ] Store public status projection fields:
  - run id
  - issue number
  - state
  - risk
  - latest error
  - PR URL
  - preview URL
  - updated timestamp

- [ ] Keep live Cloudflare credentials out of unit tests.

Run:

```bash
npm run check
```

Expected: Cloudflare adapter tests pass locally with no credentials.

#### Task V3.2: Add Oracle Runner Adapter

**Files:**
- Create: `src/oracle/runner.ts`
- Create: `src/runtime/sleep-wake.ts`
- Test: `src/oracle/runner.test.ts`

- [ ] Define runner contract:

```ts
export type RunnerJob = {
  id: string;
  issueNumber: string;
  title: string;
  body: string;
};

export type RunnerResult = {
  jobId: string;
  status: "completed" | "failed" | "blocked";
  summary: string;
};
```

- [ ] Add sleep/wake trigger types:

```ts
export type WakeTrigger =
  | { type: "timer"; wakeAt: string }
  | { type: "github_comment"; issueNumber: string }
  | { type: "ci_completed"; runId: string }
  | { type: "queue_message"; queueId: string };
```

- [ ] Keep the adapter inert until deployment configuration is provided.
- [ ] Preserve GitHub Actions as fallback runner.

Run:

```bash
npm run check
```

Expected: Oracle adapter tests pass locally with no credentials.

#### Task V3.3: Add Generated Wiki And Status Pages

**Files:**
- Create: `src/wiki/generate.ts`
- Create: `docs/wiki/overview.md`
- Create: `docs/wiki/operator-guide.md`
- Create: `docs/wiki/scorecard.md`
- Modify: `package.json`
- Test: `src/wiki/generate.test.ts`

- [ ] Add script:

```json
{
  "scripts": {
    "wiki": "tsx src/wiki/generate.ts"
  }
}
```

- [ ] Generate wiki from:
  - OS machine states
  - slash command definitions
  - latest scorecard
  - latest EvoMem summary
  - rollout stage

- [ ] Do not hand-maintain generated wiki pages.

Run:

```bash
npm run wiki
npm run check
```

Expected: wiki files are generated and tests pass.

## Explicit Deferrals

Do not implement these before V0 and V1 are stable:

- Full LCM summary DAG with async compaction.
- Agent Lightning-compatible trainer or external store.
- HyperAgents-style meta-agent tournaments.
- Live Cloudflare queue deployment.
- Live Oracle daemon deployment.
- Automatic actor promotion to `.skills/actors`.
- Causal confidence claims from small sample sizes.
- Self-modifying workflow/security/approval policies.

## Production Acceptance Criteria By Stage

### V0 Acceptance
- `npm run check` passes.
- GitHub workflow does not crash on Cloudflare failure.
- Local smoke script exists.
- Rollback manifest exists for generated runs.

### V1 Acceptance
- xmachines/XState lifecycle controls run state.
- Typed DAG is validated before mutation.
- Protected-file edits require approval.
- Generated patches pass deterministic validators.
- Cockpit comment tells no-code user current state and next action.

### V2 Acceptance
- Failures become structured lessons.
- Relevant lessons are retrieved before planning.
- Trace spans and scorecards are recorded.
- No causal confidence is reported without enough observations.

### V3 Acceptance
- Cloudflare intake/status/queue adapters pass local tests.
- Oracle runner adapter passes local tests.
- GitHub Actions fallback remains available.
- Generated wiki reflects actual runtime state.

## Final Implementation Rule

Prefer the smallest complete loop over impressive partial architecture:

```text
intent -> risk-classified DAG -> approval if needed -> bounded patch -> verify -> PR/comment -> rollback metadata -> lesson
```

Only after that loop is stable should the system grow into Pearl scorecards, LCM summaries, Cloudflare queueing, Oracle runners, and offline meta-improvement.
