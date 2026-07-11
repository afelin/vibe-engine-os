import { afterEach, describe, expect, it } from "vitest";
import {
  resolveCodegenEndpoint,
  resolveCriticEndpoint,
  resolvePlannerEndpoint,
} from "./router.js";

const envKeys = [
  "VIBE_PLANNER_PROVIDER",
  "VIBE_CODEGEN_PROVIDER",
  "VIBE_CRITIC_PROVIDER",
  "VIBE_LLM_BASE_URL",
  "VIBE_LLM_API_KEY",
  "VIBE_LLM_MODEL",
  "GH_MODELS_TOKEN",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
] as const;

const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>;

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("llm router", () => {
  it("defaults to github-models planner and groq codegen", () => {
    process.env.GH_MODELS_TOKEN = "gh-token";
    process.env.GROQ_API_KEY = "groq-token";

    const planner = resolvePlannerEndpoint();
    const codegen = resolveCodegenEndpoint();

    expect(planner).toMatchObject({
      baseUrl: "https://models.inference.ai.azure.com",
      model: "gpt-4o",
    });
    expect(codegen).toMatchObject({
      baseUrl: "https://api.groq.com/openai/v1",
      jsonMode: true,
    });
  });

  it("routes openai-compatible providers through shared env vars", () => {
    process.env.VIBE_PLANNER_PROVIDER = "openai";
    process.env.VIBE_CODEGEN_PROVIDER = "openai";
    process.env.VIBE_CRITIC_PROVIDER = "openai";
    process.env.VIBE_LLM_BASE_URL = "https://integrate.api.nvidia.com/v1";
    process.env.VIBE_LLM_API_KEY = "nvidia-key";
    process.env.VIBE_LLM_MODEL = "glm-5.2";
    process.env.VIBE_PLANNER_MODEL = "glm-5.2";
    process.env.VIBE_CODEGEN_MODEL = "glm-5.2";

    expect(resolvePlannerEndpoint()).toMatchObject({
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "glm-5.2",
    });
    expect(resolveCodegenEndpoint()).toMatchObject({ jsonMode: true });
    expect(resolveCriticEndpoint()).toEqual({
      kind: "openai",
      endpoint: expect.objectContaining({ model: "glm-5.2" }),
    });
  });

  it("allows turning critic off for deterministic-only runs", () => {
    process.env.VIBE_CRITIC_PROVIDER = "off";
    expect(resolveCriticEndpoint()).toEqual({ kind: "off" });
  });
});
