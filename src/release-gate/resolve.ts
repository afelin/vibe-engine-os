export type GeneratedPatchFile = { path: string; content: string };

export type ReleaseGateMatch = {
  id: "cloud-loop-smoke" | "pr-review-smoke";
  planLines: string[];
  files: GeneratedPatchFile[];
};

function vitestSmokeTest(
  moduleBase: string,
  exportName: string,
  token: string,
): string {
  return [
    'import { describe, expect, it } from "vitest";',
    `import { ${exportName} } from "./${moduleBase}.js";`,
    "",
    `describe("${moduleBase.replace(/-/g, " ")}", () => {`,
    '  it("exports the v1 status token", () => {',
    `    expect(${exportName}).toBe("${token}");`,
    "  });",
    "});",
    "",
  ].join("\n");
}

const CLOUD_LOOP_GATE: ReleaseGateMatch = {
  id: "cloud-loop-smoke",
  planLines: [
    "Deterministic V1 cloud-loop smoke patch.",
    'Create src/cloud-loop-smoke.ts exporting cloudLoopSmokeStatus = "v1-cloud-loop-ok".',
    "Create src/cloud-loop-smoke.test.ts with Vitest importing ./cloud-loop-smoke.js.",
  ],
  files: [
    {
      path: "src/cloud-loop-smoke.ts",
      content: 'export const cloudLoopSmokeStatus = "v1-cloud-loop-ok";\n',
    },
    {
      path: "src/cloud-loop-smoke.test.ts",
      content: vitestSmokeTest(
        "cloud-loop-smoke",
        "cloudLoopSmokeStatus",
        "v1-cloud-loop-ok",
      ),
    },
  ],
};

const PR_REVIEW_GATE: ReleaseGateMatch = {
  id: "pr-review-smoke",
  planLines: [
    "Deterministic V1 pull_request_review smoke patch.",
    'Create src/pr-review-smoke.ts exporting prReviewSmokeStatus = "v1-pr-review-ok".',
    "Create src/pr-review-smoke.test.ts with Vitest importing ./pr-review-smoke.js.",
  ],
  files: [
    {
      path: "src/pr-review-smoke.ts",
      content: 'export const prReviewSmokeStatus = "v1-pr-review-ok";\n',
    },
    {
      path: "src/pr-review-smoke.test.ts",
      content: vitestSmokeTest(
        "pr-review-smoke",
        "prReviewSmokeStatus",
        "v1-pr-review-ok",
      ),
    },
  ],
};

function matchesCloudLoopSmoke(spec: string): boolean {
  return (
    spec.includes("src/cloud-loop-smoke.ts") &&
    spec.includes("src/cloud-loop-smoke.test.ts")
  );
}

function matchesPrReviewSmoke(title: string, body: string): boolean {
  const spec = `${title}\n${body}`.toLowerCase();

  if (spec.includes("pr review workflow smoke trigger")) {
    return true;
  }

  if (
    spec.includes("src/pr-review-smoke.ts") &&
    spec.includes("src/pr-review-smoke.test.ts")
  ) {
    return true;
  }

  if (spec.includes("release-gate-pr-review-smoke")) {
    return true;
  }

  return false;
}

export function resolveReleaseGatePatch(
  title: string,
  body: string,
): ReleaseGateMatch | null {
  const spec = `${title}\n${body}`;

  if (matchesCloudLoopSmoke(spec)) {
    return CLOUD_LOOP_GATE;
  }

  if (matchesPrReviewSmoke(title, body)) {
    return PR_REVIEW_GATE;
  }

  return null;
}
