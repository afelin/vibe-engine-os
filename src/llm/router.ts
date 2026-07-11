export type OpenAiEndpoint = {
  baseUrl: string;
  apiKey: string;
  model: string;
  jsonMode?: boolean;
};

export type CriticEndpoint =
  | { kind: "gemini"; apiKey: string }
  | { kind: "openai"; endpoint: OpenAiEndpoint }
  | { kind: "off" };

type OpenAiProviderName = "github-models" | "groq" | "openai" | "off";
type CriticProviderName = "gemini" | "openai" | "off";

function readOpenAiProvider(role: "planner" | "codegen"): OpenAiProviderName {
  const value = process.env[`VIBE_${role.toUpperCase()}_PROVIDER`];
  if (value === "off") return "off";
  if (value === "github-models" || value === "groq" || value === "openai") {
    return value;
  }

  return role === "planner" ? "github-models" : "groq";
}

function readCriticProvider(): CriticProviderName {
  const value = process.env.VIBE_CRITIC_PROVIDER;
  if (value === "off") return "off";
  if (value === "openai") return "openai";
  return "gemini";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function openAiFromEnv(role: "PLANNER" | "CODEGEN" | "CRITIC"): OpenAiEndpoint {
  const baseUrl =
    process.env[`VIBE_${role}_BASE_URL`] ?? process.env.VIBE_LLM_BASE_URL;
  const apiKey =
    process.env[`VIBE_${role}_API_KEY`] ?? process.env.VIBE_LLM_API_KEY;
  const model = process.env[`VIBE_${role}_MODEL`] ?? process.env.VIBE_LLM_MODEL;

  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      `OpenAI-compatible ${role.toLowerCase()} requires VIBE_${role}_BASE_URL/API_KEY/MODEL or VIBE_LLM_*`,
    );
  }

  return { baseUrl, apiKey, model };
}

export function resolvePlannerEndpoint(): OpenAiEndpoint | "off" {
  const provider = readOpenAiProvider("planner");
  if (provider === "off") return "off";

  if (provider === "github-models") {
    return {
      baseUrl: "https://models.inference.ai.azure.com",
      apiKey: requireEnv("GH_MODELS_TOKEN"),
      model: process.env.VIBE_PLANNER_MODEL ?? "gpt-4o",
    };
  }

  if (provider === "groq") {
    return {
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: requireEnv("GROQ_API_KEY"),
      model: process.env.VIBE_PLANNER_MODEL ?? "llama-3.3-70b-versatile",
    };
  }

  return openAiFromEnv("PLANNER");
}

export function resolveCodegenEndpoint(): OpenAiEndpoint | "off" {
  const provider = readOpenAiProvider("codegen");
  if (provider === "off") return "off";

  if (provider === "groq") {
    return {
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: requireEnv("GROQ_API_KEY"),
      model: process.env.VIBE_CODEGEN_MODEL ?? "llama-3.3-70b-versatile",
      jsonMode: true,
    };
  }

  if (provider === "github-models") {
    return {
      baseUrl: "https://models.inference.ai.azure.com",
      apiKey: requireEnv("GH_MODELS_TOKEN"),
      model: process.env.VIBE_CODEGEN_MODEL ?? "gpt-4o",
      jsonMode: true,
    };
  }

  return { ...openAiFromEnv("CODEGEN"), jsonMode: true };
}

export function resolveCriticEndpoint(): CriticEndpoint {
  const provider = readCriticProvider();
  if (provider === "off") return { kind: "off" };

  if (provider === "openai") {
    return { kind: "openai", endpoint: openAiFromEnv("CRITIC") };
  }

  return { kind: "gemini", apiKey: requireEnv("GEMINI_API_KEY") };
}
