/**
 * Fence untrusted tool dumps (e.g. heal context) so models treat them as data.
 */
export function fenceUntrusted(
  label: string,
  body: string,
  opts?: { maxChars?: number },
): string {
  const max = opts?.maxChars ?? 12_000;
  const trimmed =
    body.length > max
      ? `${body.slice(0, max)}\n…[truncated ${body.length - max} chars]`
      : body;
  const safeLabel = label.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 64);
  return (
    `<<<UNTRUSTED_TOOL_OUTPUT label="${safeLabel}">>>\n` +
    `${trimmed}\n` +
    `<<<END_UNTRUSTED_TOOL_OUTPUT>>>`
  );
}
