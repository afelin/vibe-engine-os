export function dedupeLines(text: string): string {
  const lines = text.split("\n");
  const kept = new Set<string>();
  const result: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!kept.has(line)) {
      kept.add(line);
      result.unshift(line);
    }
  }
  return result.join("\n");
}

export function capContext(
  text: string,
  maxChars: number,
  from: "head" | "tail" = "head",
): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  if (from === "tail") {
    return `…[context truncated: ${omitted} chars omitted from start to fit model input limits]\n\n${text.slice(-maxChars)}`;
  }
  return `${text.slice(0, maxChars)}\n\n…[context truncated: ${omitted} chars omitted to fit model input limits]`;
}

export function capFileContent(
  content: string,
  maxPerFile: number,
): { content: string; truncated: boolean } {
  const capped = capContext(content, maxPerFile);
  return { content: capped, truncated: capped.length < content.length };
}
