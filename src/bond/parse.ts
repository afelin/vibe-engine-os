const SECTION_HEADERS = [
  { key: "intent" as const, patterns: [/###\s*Intent[^\n]*/i, /##\s*Intent[^\n]*/i] },
  {
    key: "outcome" as const,
    patterns: [/###\s*Outcome[^\n]*/i, /##\s*Outcome[^\n]*/i],
  },
  {
    key: "files" as const,
    patterns: [
      /###\s*Files to touch[^\n]*/i,
      /##\s*Files to touch[^\n]*/i,
    ],
  },
  {
    key: "constraints" as const,
    patterns: [/###\s*Constraints[^\n]*/i, /##\s*Constraints[^\n]*/i],
  },
  {
    key: "context" as const,
    patterns: [/###\s*Extra context[^\n]*/i, /##\s*Extra context[^\n]*/i],
  },
];

const PATH_PATTERNS = [
  /\bsrc\/[\w./-]+\.(?:ts|tsx|js|jsx)\b/g,
  /\btests\/[\w./-]+\.(?:ts|tsx)\b/g,
  /\bsupabase\/[\w./-]+/g,
  /\.github\/[\w./-]+/g,
  /\bpackage\.json\b/g,
];

export type ParsedIssueSections = {
  intent: string;
  outcomes: string[];
  boundFiles: string[];
  constraints: string[];
};

function extractSection(body: string, patterns: RegExp[]): string {
  for (const header of patterns) {
    const match = body.match(header);
    if (!match || match.index === undefined) continue;

    const start = match.index + match[0].length;
    const rest = body.slice(start);
    const nextHeader = rest.search(/\n#{2,3}\s+\S/);
    const section = nextHeader === -1 ? rest : rest.slice(0, nextHeader);
    return section.trim();
  }
  return "";
}

function parseListLines(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*\[[ xX]\]\s*/, "").replace(/^[-*]\s+/, ""))
    .filter(Boolean);
}

function looksLikeFilePath(line: string): boolean {
  if (!line || line.includes(" ")) return false;
  if (line === "package.json") return true;
  return /^(src|tests|supabase|\.github|\.planning|\.skills)\//.test(line);
}

function parseFilePaths(section: string): string[] {
  const fromLines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, ""))
    .filter((line) => !line.startsWith("#") && looksLikeFilePath(line));

  const fromRegex = PATH_PATTERNS.flatMap((pattern) =>
    [...section.matchAll(pattern)].map((match) => match[0]),
  );

  return [...new Set([...fromLines, ...fromRegex])].sort();
}

function fallbackIntent(body: string): string {
  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  return firstLine ?? "";
}

export function parseIssueBody(body: string): ParsedIssueSections {
  const intentSection = extractSection(body, SECTION_HEADERS[0].patterns);
  const outcomeSection = extractSection(body, SECTION_HEADERS[1].patterns);
  const filesSection = extractSection(body, SECTION_HEADERS[2].patterns);
  const constraintsSection = extractSection(body, SECTION_HEADERS[3].patterns);

  const outcomes = parseListLines(outcomeSection);
  const boundFilesFromSection = parseFilePaths(filesSection);
  const boundFilesFromBody =
    boundFilesFromSection.length > 0
      ? boundFilesFromSection
      : parseFilePaths(body);
  const constraints = parseListLines(constraintsSection);

  const intent = (intentSection || fallbackIntent(body)).slice(0, 500);

  return {
    intent,
    outcomes,
    boundFiles: boundFilesFromBody,
    constraints,
  };
}
