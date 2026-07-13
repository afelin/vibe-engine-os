import { parseIssueBody } from "./parse.js";

const PATH_PATTERNS = [
  /\bsrc\/[\w./-]+\.(?:ts|tsx)\b/g,
  /\btests\/[\w./-]+\.(?:ts|tsx)\b/g,
  /\.github\/[\w./-]+/g,
  /\bpackage\.json\b/g,
];

export function extractRequiredPaths(body: string): string[] {
  const fromBond = parseIssueBody(body).boundFiles;
  if (fromBond.length > 0) return fromBond;

  const paths = PATH_PATTERNS.flatMap((pattern) =>
    [...body.matchAll(pattern)].map((match) => match[0]),
  );
  return [...new Set(paths)];
}
