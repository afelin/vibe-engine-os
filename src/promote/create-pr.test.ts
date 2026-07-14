import { describe, expect, it, vi } from "vitest";
import {
  createPullRequest,
  findPullRequestForHead,
  formatGitHubError,
  isNoCommitsBetweenError,
} from "./create-pr.js";

type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function hrefFromInput(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe("create-pr", () => {
  it("formats GitHub validation errors with field details", () => {
    expect(
      formatGitHubError(
        {
          message: "Validation Failed",
          errors: [{ resource: "PullRequest", field: "head", code: "invalid", message: "invalid" }],
        },
        422,
      ),
    ).toContain("Validation Failed");
    expect(
      formatGitHubError(
        {
          message: "Validation Failed",
          errors: [{ resource: "PullRequest", field: "head", code: "invalid", message: "invalid" }],
        },
        422,
      ),
    ).toContain("head");
  });

  it("detects no-commits-between validation failures", () => {
    expect(isNoCommitsBetweenError("Validation Failed — head: custom — No commits between main and vibe/issue-1")).toBe(
      true,
    );
    expect(isNoCommitsBetweenError("Not found")).toBe(false);
  });

  it("returns existing open PR for head branch", async () => {
    const fetchImpl = vi.fn<FetchFn>(async (input) => {
      const href = hrefFromInput(input);
      if (href.includes("/pulls?")) {
        return new Response(
          JSON.stringify([
            {
              number: 42,
              html_url: "https://github.com/acme/repo/pull/42",
              state: "open",
              head: { ref: "vibe/issue-1" },
              base: { ref: "main" },
            },
          ]),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    });

    const existing = await findPullRequestForHead(
      { token: "t", owner: "acme", repo: "repo", head: "vibe/issue-1", base: "main" },
      fetchImpl,
    );
    expect(existing?.html_url).toBe("https://github.com/acme/repo/pull/42");
  });

  it("creates PR when none exists", async () => {
    const fetchImpl = vi.fn<FetchFn>(async (input, init) => {
      const href = hrefFromInput(input);
      if (href.includes("/pulls?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (href.endsWith("/pulls") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            number: 7,
            html_url: "https://github.com/acme/repo/pull/7",
            state: "open",
          }),
          { status: 201 },
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    });

    const result = await createPullRequest(
      {
        token: "t",
        owner: "acme",
        repo: "repo",
        title: "feat: test",
        head: "vibe/issue-2",
        base: "main",
      },
      fetchImpl,
    );
    expect(result.status).toBe("created");
    if (result.status === "created") {
      expect(result.url).toContain("/pull/7");
    }
  });

  it("returns existing PR when create hits already-exists validation", async () => {
    let listCalls = 0;
    const fetchImpl = vi.fn<FetchFn>(async (input, init) => {
      const href = hrefFromInput(input);
      if (href.includes("/pulls?")) {
        listCalls += 1;
        if (listCalls === 1) return new Response(JSON.stringify([]), { status: 200 });
        return new Response(
          JSON.stringify([
            {
              number: 99,
              html_url: "https://github.com/acme/repo/pull/99",
              state: "open",
              head: { ref: "vibe/issue-3" },
              base: { ref: "main" },
            },
          ]),
          { status: 200 },
        );
      }
      if (href.endsWith("/pulls") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            message: "Validation Failed",
            errors: [{ message: "A pull request already exists for acme:repo:vibe/issue-3." }],
          }),
          { status: 422 },
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    });

    const result = await createPullRequest(
      {
        token: "t",
        owner: "acme",
        repo: "repo",
        title: "feat: test",
        head: "vibe/issue-3",
      },
      fetchImpl,
    );
    expect(result.status).toBe("existing");
    if (result.status === "existing") {
      expect(result.url).toContain("/pull/99");
    }
  });

  it("adds hint when head branch has no commits beyond base", async () => {
    const fetchImpl = vi.fn<FetchFn>(async (input, init) => {
      const href = hrefFromInput(input);
      if (href.includes("/pulls?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (href.endsWith("/pulls") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            message: "Validation Failed",
            errors: [{ message: "No commits between main and vibe/issue-4" }],
          }),
          { status: 422 },
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    });

    await expect(
      createPullRequest(
        {
          token: "t",
          owner: "acme",
          repo: "repo",
          title: "feat: test",
          head: "vibe/issue-4",
        },
        fetchImpl,
      ),
    ).rejects.toThrow(/unique commit/i);
  });
});
