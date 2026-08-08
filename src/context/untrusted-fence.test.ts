import { describe, expect, it } from "vitest";
import { fenceUntrusted } from "./untrusted-fence.js";

describe("untrusted fence", () => {
  it("wraps tool dumps", () => {
    const out = fenceUntrusted("heal.dump", "raw tool output");
    expect(out).toContain("UNTRUSTED_TOOL_OUTPUT");
    expect(out).toContain("raw tool output");
    expect(out).toContain('label="heal.dump"');
  });

  it("truncates long dumps", () => {
    const out = fenceUntrusted("x", "a".repeat(100), { maxChars: 20 });
    expect(out).toContain("truncated");
  });
});
