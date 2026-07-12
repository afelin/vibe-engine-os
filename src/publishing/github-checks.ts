export type CheckRunConclusion = "success" | "failure" | "neutral";

export type CheckRunInput = {
  token: string;
  owner: string;
  repo: string;
  headSha: string;
  name?: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: CheckRunConclusion;
  title?: string;
  summary?: string;
  detailsUrl?: string;
  externalId?: string;
  checkRunId?: number;
};

export type CheckRunResult = {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
};

export const PROMOTION_CHECK_NAME = "Vibe Promotion Gate";

const DEFAULT_NAME = PROMOTION_CHECK_NAME;

export async function createOrUpdateCheckRun(
  input: CheckRunInput,
): Promise<CheckRunResult | null> {
  const name = input.name ?? DEFAULT_NAME;
  const base = `https://api.github.com/repos/${input.owner}/${input.repo}`;

  if (input.checkRunId) {
    const res = await fetch(`${base}/check-runs/${input.checkRunId}`, {
      method: "PATCH",
      headers: githubHeaders(input.token),
      body: JSON.stringify({
        status: input.status,
        conclusion: input.conclusion,
        output: buildOutput(input),
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as CheckRunResult;
  }

  const res = await fetch(`${base}/check-runs`, {
    method: "POST",
    headers: githubHeaders(input.token),
    body: JSON.stringify({
      name,
      head_sha: input.headSha,
      status: input.status,
      conclusion: input.conclusion,
      external_id: input.externalId,
      details_url: input.detailsUrl,
      output: buildOutput(input),
    }),
  });

  if (!res.ok) return null;
  return (await res.json()) as CheckRunResult;
}

export function buildPromotionSummary(args: {
  state: string;
  vowsHash?: string;
  capsuleHash?: string;
  firstPassGreen?: boolean;
  gateIdsFailed?: string[];
  runDir?: string;
}): string {
  const lines = [
    `## Vibe Promotion Gate`,
    "",
    `**State:** ${args.state}`,
    args.vowsHash ? `**Vows hash:** \`sha256:${args.vowsHash}\`` : undefined,
    args.capsuleHash ? `**Capsule hash:** \`sha256:${args.capsuleHash}\`` : undefined,
    args.firstPassGreen !== undefined
      ? `**First-pass green:** ${args.firstPassGreen ? "yes" : "no"}`
      : undefined,
    args.gateIdsFailed && args.gateIdsFailed.length > 0
      ? `**Gates failed:** ${args.gateIdsFailed.join(", ")}`
      : undefined,
    args.runDir ? `**Run directory:** \`${args.runDir}\`` : undefined,
    "",
    "Validate locally: `npm run gate:resolve` or MCP `validate_capsule`.",
  ].filter((line): line is string => line !== undefined);

  return lines.join("\n");
}

export function parseRepository(repository: string): { owner: string; repo: string } | null {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function buildOutput(input: CheckRunInput) {
  return {
    title: input.title ?? DEFAULT_NAME,
    summary: input.summary ?? "Vibe Engine promotion gate",
  };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}
