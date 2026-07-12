import { describe, expect, it } from "vitest";
import { capContext, dedupeLines } from "./run.js";

describe("capContext", () => {
  it("preserves head content when capping from the start", () => {
    const text = "ABCDEFGHIJ";
    const capped = capContext(text, 4);
    expect(capped.startsWith("ABCD")).toBe(true);
    expect(capped).not.toContain("GHIJ");
    expect(capped).toContain("context truncated");
  });

  it("preserves tail content when capping from the end", () => {
    const text = "ABCDEFGHIJ";
    const capped = capContext(text, 4, "tail");
    expect(capped.endsWith("GHIJ")).toBe(true);
    expect(capped).not.toContain("ABCD");
    expect(capped).toContain("omitted from start");
  });
});

describe("dedupeLines", () => {
  it("keeps the last occurrence of duplicate lines in last-seen order", () => {
    const input = ["old lesson", "unique", "old lesson", "newest lesson", "unique"].join(
      "\n",
    );
    expect(dedupeLines(input)).toBe(
      ["old lesson", "newest lesson", "unique"].join("\n"),
    );
  });
});
