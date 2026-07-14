export type CreatePrInput = {
  token: string;
  owner: string;
  repo: string;
  title: string;
  head: string;
  base?: string;
  body?: string;
};

export type PullRequestRef = {
  number: number;
  html_url: string;
  state: string;
};

export type CreatePrResult =
  | { status: "created"; url: string; number: number }
  | { status: "existing"; url: string; number: number; state: string };

type GitHubPull = {
  number: number;
  html_url: string;
  state: string;
  head?: { ref?: string };
  base?: { ref?: string };
};

type GitHubErrorPayload = {
  message?: string;
  errors?: Array<{ message?: string; resource?: string; field?: string; code?: string }>;
};

export function formatGitHubError(payload: GitHubErrorPayload, status: number): string {
  const parts: string[] = [];
  if (payload.message) parts.push(payload.message);
  for (const err of payload.errors ?? []) {
    const detail = [err.field, err.code, err.message].filter(Boolean).join(": ");
    if (detail) parts.push(detail);
  }
  if (parts.length === 0) parts.push(`HTTP ${status}`);
  return parts.join(" — ");
}

export function isNoCommitsBetweenError(message: string): boolean {
  return /no commits between/i.test(message);
}

type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function findPullRequestForHead(
  input: Pick<CreatePrInput, "token" | "owner" | "repo" | "head" | "base">,
  fetchImpl: FetchFn = fetch,
): Promise<PullRequestRef | undefined> {
  const base = input.base ?? "main";
  const headParam = `${input.owner}:${input.head}`;
  const url = new URL(`https://api.github.com/repos/${input.owner}/${input.repo}/pulls`);
  url.searchParams.set("head", headParam);
  url.searchParams.set("state", "all");
  url.searchParams.set("per_page", "30");

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    const payload = (await response.json()) as GitHubErrorPayload;
    throw new Error(
      `Failed to list PRs for head ${input.head}: ${formatGitHubError(payload, response.status)}`,
    );
  }

  const pulls = (await response.json()) as GitHubPull[];
  const match =
    pulls.find((pr) => pr.head?.ref === input.head && pr.base?.ref === base) ??
    pulls.find((pr) => pr.head?.ref === input.head);

  if (!match) return undefined;
  return { number: match.number, html_url: match.html_url, state: match.state };
}

export async function createPullRequest(
  input: CreatePrInput,
  fetchImpl: FetchFn = fetch,
): Promise<CreatePrResult> {
  const base = input.base ?? "main";
  const existing = await findPullRequestForHead(
    { token: input.token, owner: input.owner, repo: input.repo, head: input.head, base },
    fetchImpl,
  );
  if (existing) {
    return {
      status: "existing",
      url: existing.html_url,
      number: existing.number,
      state: existing.state,
    };
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        head: input.head,
        base,
        body: input.body ?? "",
      }),
    },
  );

  const payload = (await response.json()) as GitHubPull & GitHubErrorPayload;
  if (!response.ok) {
    const message = formatGitHubError(payload, response.status);
    if (/already exists/i.test(message)) {
      const retry = await findPullRequestForHead(
        { token: input.token, owner: input.owner, repo: input.repo, head: input.head, base },
        fetchImpl,
      );
      if (retry) {
        return {
          status: "existing",
          url: retry.html_url,
          number: retry.number,
          state: retry.state,
        };
      }
    }
    const hint = isNoCommitsBetweenError(message)
      ? " Hint: push a unique commit on the head branch before opening a PR (promotion stamp or generated files)."
      : "";
    throw new Error(`${message}${hint}`);
  }

  return {
    status: "created",
    url: payload.html_url,
    number: payload.number,
  };
}
