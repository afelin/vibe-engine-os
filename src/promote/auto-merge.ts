import {
  ATTRIBUTION_CHECK_NAME,
  PROMOTION_CHECK_NAME,
  parseRepository,
} from "../publishing/github-checks.js";

export const AUTO_MERGE_LABEL = "vibe/auto-merge";

export type PullRequestSnapshot = {
  number: number;
  state: string;
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  html_url: string;
  head: { sha: string };
  labels: { name: string }[];
};

export type CheckRunSnapshot = {
  name: string;
  status: string;
  conclusion: string | null;
};

export type AutoMergeVerdict = {
  ok: boolean;
  reason: string;
  merged?: boolean;
  prUrl?: string;
  prNumber?: number;
};

export function requireAutoMergeLabel(
  pr: PullRequestSnapshot,
  requireLabel: boolean,
): AutoMergeVerdict | null {
  if (pr.merged) {
    return {
      ok: true,
      reason: "already_merged",
      merged: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  }
  if (pr.state !== "open") {
    return { ok: false, reason: "pr_not_open", prUrl: pr.html_url, prNumber: pr.number };
  }
  if (
    requireLabel &&
    !pr.labels.some((label) => label.name === AUTO_MERGE_LABEL)
  ) {
    return {
      ok: false,
      reason: "missing_auto_merge_label",
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  }
  return null;
}

export function evaluateMergeReadiness(
  pr: PullRequestSnapshot,
  promotionCheck: CheckRunSnapshot | null,
  attributionCheck: CheckRunSnapshot | null,
): AutoMergeVerdict {
  if (pr.mergeable === false) {
    return {
      ok: false,
      reason: "not_mergeable",
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  }
  if (pr.mergeable_state !== "clean") {
    return {
      ok: false,
      reason: `mergeable_state_${pr.mergeable_state}`,
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  }
  if (
    !promotionCheck ||
    promotionCheck.status !== "completed" ||
    promotionCheck.conclusion !== "success"
  ) {
    return {
      ok: false,
      reason: "promotion_gate_not_green",
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  }
  if (
    !attributionCheck ||
    attributionCheck.status !== "completed" ||
    attributionCheck.conclusion !== "success"
  ) {
    return {
      ok: false,
      reason: "attribution_gate_not_green",
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  }
  return {
    ok: true,
    reason: "ready_to_merge",
    prUrl: pr.html_url,
    prNumber: pr.number,
  };
}

export function pickPromotionCheck(
  checks: CheckRunSnapshot[],
): CheckRunSnapshot | null {
  return checks.find((check) => check.name === PROMOTION_CHECK_NAME) ?? null;
}

export function pickAttributionCheck(
  checks: CheckRunSnapshot[],
): CheckRunSnapshot | null {
  return (
    checks.find((check) => check.name === ATTRIBUTION_CHECK_NAME) ??
    checks.find((check) => check.name === "attribution-audit") ??
    null
  );
}

type FetchFn = typeof fetch;

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubGet<T>(
  fetchFn: FetchFn,
  token: string,
  url: string,
): Promise<T> {
  const response = await fetchFn(url, { headers: githubHeaders(token) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

export async function fetchPullRequest(
  fetchFn: FetchFn,
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullRequestSnapshot> {
  return githubGet(
    fetchFn,
    token,
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
  );
}

export async function findPullRequestsForSha(
  fetchFn: FetchFn,
  token: string,
  owner: string,
  repo: string,
  headSha: string,
): Promise<PullRequestSnapshot[]> {
  return githubGet(
    fetchFn,
    token,
    `https://api.github.com/repos/${owner}/${repo}/commits/${headSha}/pulls`,
  );
}

export async function fetchCheckRunsForRef(
  fetchFn: FetchFn,
  token: string,
  owner: string,
  repo: string,
  ref: string,
): Promise<CheckRunSnapshot[]> {
  const payload = await githubGet<{ check_runs: CheckRunSnapshot[] }>(
    fetchFn,
    token,
    `https://api.github.com/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`,
  );
  return payload.check_runs ?? [];
}

export async function mergePullRequest(
  fetchFn: FetchFn,
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<{ sha: string; merged: boolean }> {
  const response = await fetchFn(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
    {
      method: "PUT",
      headers: githubHeaders(token),
      body: JSON.stringify({
        merge_method: "squash",
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Merge failed ${response.status}: ${body.slice(0, 200)}`);
  }
  return (await response.json()) as { sha: string; merged: boolean };
}

export type AutoMergeOptions = {
  pullNumber?: number;
  headSha?: string;
  dryRun?: boolean;
  requireLabel?: boolean;
  token?: string;
  repository?: string;
  fetchFn?: FetchFn;
};

export async function attemptAutoMerge(
  options: AutoMergeOptions,
): Promise<AutoMergeVerdict> {
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repository =
    options.repository ?? process.env.GITHUB_REPOSITORY ?? "";
  const fetchFn = options.fetchFn ?? fetch;
  const requireLabel =
    options.requireLabel ??
    !["1", "true", "yes"].includes(
      (process.env.VIBE_AUTO_MERGE ?? "").toLowerCase(),
    );

  if (!token) {
    return { ok: false, reason: "missing_github_token" };
  }

  const parsed = parseRepository(repository);
  if (!parsed) {
    return { ok: false, reason: "invalid_github_repository" };
  }

  let pullNumber = options.pullNumber;
  if (!pullNumber && options.headSha) {
    const linked = await findPullRequestsForSha(
      fetchFn,
      token,
      parsed.owner,
      parsed.repo,
      options.headSha,
    );
    const open = linked.filter((pr) => pr.state === "open");
    if (open.length === 0) {
      return { ok: false, reason: "no_open_pr_for_sha" };
    }
    pullNumber = open[0]?.number;
  }

  if (!pullNumber) {
    return { ok: false, reason: "missing_pull_number" };
  }

  const pr = await fetchPullRequest(
    fetchFn,
    token,
    parsed.owner,
    parsed.repo,
    pullNumber,
  );

  const labelVerdict = requireAutoMergeLabel(pr, requireLabel);
  if (labelVerdict) return labelVerdict;

  const checks = await fetchCheckRunsForRef(
    fetchFn,
    token,
    parsed.owner,
    parsed.repo,
    pr.head.sha,
  );
  const readiness = evaluateMergeReadiness(
    pr,
    pickPromotionCheck(checks),
    pickAttributionCheck(checks),
  );
  if (!readiness.ok) return readiness;

  if (options.dryRun) {
    return {
      ok: true,
      reason: "dry_run_ready",
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  }

  await mergePullRequest(fetchFn, token, parsed.owner, parsed.repo, pr.number);
  return {
    ok: true,
    reason: "merged",
    merged: true,
    prUrl: pr.html_url,
    prNumber: pr.number,
  };
}
