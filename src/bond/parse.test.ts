import { describe, expect, it } from "vitest";
import { parseIssueBody } from "./parse.js";

describe("parseIssueBody", () => {
  it("parses GitHub issue form sections", () => {
    const body = `### Intent (one sentence)
Add health endpoint

### Outcome (how we know it's done)
- GET /health returns ok
- Unit test passes

### Files to touch (exact paths)
src/health.ts
src/health.test.ts

### Constraints (optional)
Do not change package.json
`;

    const parsed = parseIssueBody(body);
    expect(parsed.intent).toContain("Add health endpoint");
    expect(parsed.outcomes).toHaveLength(2);
    expect(parsed.boundFiles).toEqual(["src/health.test.ts", "src/health.ts"]);
    expect(parsed.constraints[0]).toContain("package.json");
  });

  it("falls back to regex path extraction", () => {
    const parsed = parseIssueBody(
      "Please update src/foo.ts and src/foo.test.ts for the feature.",
    );
    expect(parsed.boundFiles).toContain("src/foo.ts");
    expect(parsed.boundFiles).toContain("src/foo.test.ts");
  });
});
