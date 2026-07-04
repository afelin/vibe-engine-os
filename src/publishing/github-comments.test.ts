import { describe, expect, it } from "vitest";
import {
  cockpitCommentMarker,
  publishCockpitComment,
  resolveGitHubCommentTarget,
} from "./github-comments.js";

describe("GitHub cockpit comments", () => {
  it("skips safely when token or repository is missing", async () => {
    const target = resolveGitHubCommentTarget({
      GITHUB_REPOSITORY: "afelin/vibe-engine-os",
      ISSUE_NUMBER: "12",
    });

    expect(target).toEqual({
      enabled: false,
      reason: "Missing GITHUB_TOKEN",
    });
  });

  it("creates a cockpit comment when no existing marker is found", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: url.toString(), init });

      if (!init?.method) {
        return jsonResponse([]);
      }

      return jsonResponse({
        id: 99,
        html_url: "https://github.com/afelin/vibe-engine-os/issues/12#issuecomment-99",
      });
    };

    const result = await publishCockpitComment({
      token: "token",
      repository: "afelin/vibe-engine-os",
      issueNumber: "12",
      body: "## Vibe Engine OS Cockpit",
      fetchImpl,
    });

    expect(result).toEqual({
      status: "created",
      url: "https://github.com/afelin/vibe-engine-os/issues/12#issuecomment-99",
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe(
      "https://api.github.com/repos/afelin/vibe-engine-os/issues/12/comments",
    );
    expect(calls[1]?.init?.method).toBe("POST");
    expect(String(calls[1]?.init?.body)).toContain(cockpitCommentMarker);
  });

  it("updates the existing cockpit comment when the marker is found", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: url.toString(), init });

      if (!init?.method) {
        return jsonResponse([
          {
            id: 42,
            body: `${cockpitCommentMarker}\nold body`,
            url: "https://api.github.com/repos/afelin/vibe-engine-os/issues/comments/42",
            html_url:
              "https://github.com/afelin/vibe-engine-os/issues/12#issuecomment-42",
          },
        ]);
      }

      return jsonResponse({
        id: 42,
        html_url: "https://github.com/afelin/vibe-engine-os/issues/12#issuecomment-42",
      });
    };

    const result = await publishCockpitComment({
      token: "token",
      repository: "afelin/vibe-engine-os",
      issueNumber: "12",
      body: "## updated",
      fetchImpl,
    });

    expect(result).toEqual({
      status: "updated",
      url: "https://github.com/afelin/vibe-engine-os/issues/12#issuecomment-42",
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe(
      "https://api.github.com/repos/afelin/vibe-engine-os/issues/comments/42",
    );
    expect(calls[1]?.init?.method).toBe("PATCH");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
