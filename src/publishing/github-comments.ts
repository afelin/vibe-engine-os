export const cockpitCommentMarker = "<!-- vibe-engine-os-cockpit -->";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type GitHubCommentTarget =
  | {
      enabled: true;
      token: string;
      repository: string;
      issueNumber: string;
    }
  | { enabled: false; reason: string };

export type PublishCockpitCommentOptions = {
  token: string;
  repository: string;
  issueNumber: string;
  body: string;
  fetchImpl?: FetchLike;
};

export type PublishCockpitCommentResult =
  | { status: "created"; url?: string }
  | { status: "updated"; url?: string };

type GitHubIssueComment = {
  id: number;
  body?: string;
  url: string;
  html_url?: string;
};

export function resolveGitHubCommentTarget(
  env: NodeJS.ProcessEnv,
): GitHubCommentTarget {
  if (!env.GITHUB_TOKEN) {
    return { enabled: false, reason: "Missing GITHUB_TOKEN" };
  }
  if (!env.GITHUB_REPOSITORY) {
    return { enabled: false, reason: "Missing GITHUB_REPOSITORY" };
  }
  if (!env.ISSUE_NUMBER || env.ISSUE_NUMBER === "000") {
    return { enabled: false, reason: "Missing ISSUE_NUMBER" };
  }

  return {
    enabled: true,
    token: env.GITHUB_TOKEN,
    repository: env.GITHUB_REPOSITORY,
    issueNumber: env.ISSUE_NUMBER,
  };
}

export async function publishCockpitComment({
  token,
  repository,
  issueNumber,
  body,
  fetchImpl = fetch,
}: PublishCockpitCommentOptions): Promise<PublishCockpitCommentResult> {
  const commentsUrl = `https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`;
  const existingComments = await githubJson<GitHubIssueComment[]>(
    fetchImpl,
    commentsUrl,
    token,
  );
  const existing = existingComments.find((comment) =>
    comment.body?.includes(cockpitCommentMarker),
  );
  const markedBody = `${cockpitCommentMarker}\n${body}`;

  if (existing) {
    const updated = await githubJson<GitHubIssueComment>(
      fetchImpl,
      existing.url,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ body: markedBody }),
      },
    );
    return { status: "updated", url: updated.html_url };
  }

  const created = await githubJson<GitHubIssueComment>(
    fetchImpl,
    commentsUrl,
    token,
    {
      method: "POST",
      body: JSON.stringify({ body: markedBody }),
    },
  );
  return { status: "created", url: created.html_url };
}

async function githubJson<T>(
  fetchImpl: FetchLike,
  url: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub comments API failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
