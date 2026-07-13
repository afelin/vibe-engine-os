export type ExplainDepth = "off" | "short" | "long" | "expand";

export type ExplainResolutionInput = {
  env?: NodeJS.ProcessEnv;
  labels?: string;
  repoVar?: string;
};

const VALID_DEPTHS = new Set<ExplainDepth>(["off", "short", "long", "expand"]);

const LABEL_TO_DEPTH: Record<string, ExplainDepth> = {
  "vibe:explain-short": "short",
  "vibe:explain-long": "long",
  "vibe:explain-expand": "expand",
  "vibe:explain-off": "off",
};

export type DecisionExplainEntry = {
  short: string;
  long: string;
  expand: string;
};

export const DECISION_CATALOG: Record<string, DecisionExplainEntry> = {
  "launch.readiness": {
    short:
      "Readiness is a local preflight: workflows, gauntlet, and MCP smoke must be green before cloud proof.",
    long:
      "Launch readiness runs deterministic checks in your repo (required GitHub workflows, issue template, proof page, TaskBond gauntlet vs baseline, MCP gate smoke). If any check fails, fix it locally before spending Actions minutes on the zero-token E2E loop.",
    expand:
      "Think of readiness as a cheap gate before the expensive gate. Failing here means the cloud loop would likely stall on missing files or regressed evals. Run `npm run launch:readiness` after every adopt or workflow change. Green output means the repo is structurally ready to prove issue → PR → receipt in CI.",
  },
  "launch.proof": {
    short:
      "Launch proof opens a real issue, waits for PR + receipt, and requires promotion checks to pass.",
    long:
      "The zero-token E2E creates a labeled issue, polls until the engine posts a PR link and capsule receipt, then waits for **Vibe Promotion Gate** and **Audit Assisted-by attribution** on that PR. Success writes `.vibe/launch-proof.json` as an artifact.",
    expand:
      "This is the full product loop without Cursor tokens: issue body is the contract, Actions runs the agent path, checks enforce constitution. If proof times out, inspect the issue comments and Actions logs for **Sovereign OS Event Bus**. Do not enable branch protection until this workflow is green on `main`.",
  },
  "launch.branch_protection": {
    short:
      "Branch protection blocks direct pushes to `main` until required CI checks pass on PRs.",
    long:
      "After smoke passes, we require **Vibe Promotion Gate** and **Audit Assisted-by attribution** on every merge to `main`. That keeps promotion and attribution from being skipped accidentally.",
    expand:
      "Enabling protection needs admin repo scope (often a PAT, not the default `GITHUB_TOKEN`). If the API call fails, use GitHub → Settings → Branches → Add rule for `main`, enable required status checks, and select those two check names (they must have run at least once to appear).",
  },
  "operator.approve": {
    short:
      "`/approve` tells the engine you accept risk on a protected change so codegen can continue.",
    long:
      "At high depth or protected paths, the run pauses in **awaiting_approval**. Your comment is recorded; without it, no further files are written.",
    expand:
      "Approval is intentional friction: it prevents silent edits to sensitive areas. If you are unsure, comment `/status` first, read the TaskBond file list, then `/approve` only when the scope matches what you asked for.",
  },
  "operator.auto_merge": {
    short:
      "Label `vibe/auto-merge` squash-merges the PR when all required checks are green.",
    long:
      "Auto-merge waits for CI (including promotion gate) then merges without a manual button click. Remove the label to cancel.",
    expand:
      "Use auto-merge when you trust the issue contract and gates. If checks flap or branch protection is misconfigured, merge will stall — watch the PR checks tab and the **Vibe Auto Merge** workflow.",
  },
  "operator.receipt": {
    short:
      "The receipt links capsule + vows hashes so anyone can verify what shipped.",
    long:
      "After verification, the cockpit posts a **View proof** link (HPURL). That ties the run to constitution hashes without exposing secrets.",
    expand:
      "Receipts are how you audit agent work later: same hashes appear in `.runs/<runId>/` artifacts. For private repos the public proof URL may 404 until Pages is public — use local `proof/index.html` with the hash from the comment.",
  },
};

function parseDepth(raw: string | undefined): ExplainDepth | null {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().toLowerCase() as ExplainDepth;
  return VALID_DEPTHS.has(normalized) ? normalized : null;
}

function resolveDepthFromLabels(labelsRaw?: string): ExplainDepth | null {
  if (!labelsRaw?.trim()) return null;
  const labels = labelsRaw
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);

  for (const label of labels) {
    const depth = LABEL_TO_DEPTH[label];
    if (depth) return depth;
  }
  return null;
}

function defaultExplainDepth(env: NodeJS.ProcessEnv): ExplainDepth {
  if (env.VIBE_EXPLAIN_AGENT === "1" || env.CURSOR_AGENT === "1") {
    return "off";
  }
  return "short";
}

export function resolveExplainDepth(input: ExplainResolutionInput = {}): ExplainDepth {
  const env = input.env ?? process.env;

  const fromEnv = parseDepth(env.VIBE_EXPLAIN);
  if (fromEnv) return fromEnv;

  const fromLabels = resolveDepthFromLabels(input.labels ?? env.VIBE_LABELS);
  if (fromLabels) return fromLabels;

  const repoVar =
    input.repoVar ?? env.VIBE_EXPLAIN_REPO ?? env.VIBE_REPO_EXPLAIN;
  const fromRepo = parseDepth(repoVar);
  if (fromRepo) return fromRepo;

  return defaultExplainDepth(env);
}

export function renderDecisionExplain(
  decisionId: string,
  depth: ExplainDepth = resolveExplainDepth(),
): string {
  if (depth === "off") return "";

  const entry = DECISION_CATALOG[decisionId];
  if (!entry) return "";

  const text = entry[depth === "expand" ? "expand" : depth === "long" ? "long" : "short"];
  return [`### Why this matters`, "", text, ""].join("\n");
}

export function resolveCockpitDecisionId(state: string): string | undefined {
  switch (state) {
    case "awaiting_approval":
      return "operator.approve";
    case "completed":
      return "operator.receipt";
    case "publishing":
      return "operator.auto_merge";
    default:
      return undefined;
  }
}
