const SRC_PATH_PATTERN = /\bsrc\/[\w./-]+\.(?:ts|tsx|js|jsx)\b/g;
const SHIP_VERB_PATTERN =
  /\b(add|fix|implement|ship|deploy|update|create|refactor|wire|hook|build|patch)\b/i;

export type ShipHeuristicInput = {
  body: string;
  labels?: string;
  hasBond?: boolean;
  repository?: string;
};

export type ShipHeuristicResult = {
  looksLikeShipWork: boolean;
  srcPaths: string[];
  nudge: string | null;
};

export function extractSrcPaths(body: string): string[] {
  return [...new Set([...body.matchAll(SRC_PATH_PATTERN)].map((match) => match[0]))].sort();
}

export function detectShipWork(input: ShipHeuristicInput): ShipHeuristicResult {
  const labels = (input.labels ?? "")
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);

  if (labels.includes("vibe/run") || labels.includes("vibe:plan-only")) {
    return { looksLikeShipWork: false, srcPaths: [], nudge: null };
  }

  if (input.hasBond) {
    return { looksLikeShipWork: false, srcPaths: [], nudge: null };
  }

  const srcPaths = extractSrcPaths(input.body);
  const looksLikeShipWork =
    srcPaths.length >= 2 && SHIP_VERB_PATTERN.test(input.body);

  if (!looksLikeShipWork) {
    return { looksLikeShipWork: false, srcPaths, nudge: null };
  }

  return {
    looksLikeShipWork: true,
    srcPaths,
    nudge: buildShipNudge(input.repository, srcPaths),
  };
}

function buildShipNudge(repository: string | undefined, srcPaths: string[]): string {
  const repo = repository ?? "owner/repo";
  const templateUrl = `https://github.com/${repo}/issues/new?template=vibe-request.yml`;
  const pathList = srcPaths.slice(0, 4).map((path) => `- \`${path}\``).join("\n");

  return [
    "## This looks like ship work",
    "",
    "This comment names multiple `src/` paths with implementation verbs but is not a sealed Vibe Request.",
    "",
    "**Suggested bound files (2–4):**",
    pathList,
    "",
    "Open a [Vibe Request issue](" + templateUrl + ") with:",
    "- Intent + outcome checklist",
    "- Those exact paths under **Files to touch**",
    "- Label `vibe/run` (and `vibe:ship` if you want deploy depth)",
    "",
    "The engine will not auto-run from chat or drive-by PR comments — only from labeled issues or `/vibe`.",
  ].join("\n");
}
