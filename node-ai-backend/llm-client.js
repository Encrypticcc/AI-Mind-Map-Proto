import OpenAI from "openai";

const pickEnv = (...keys) => {
  for (const key of keys) {
    if (!key) continue;
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
};

export function buildLlmClient(options = {}) {
  const provider = (options.provider || pickEnv("AI_PROVIDER") || "openai").toLowerCase();
  const baseURL =
    options.baseURL ||
    pickEnv("AI_BASE_URL", "OPENAI_BASE_URL") ||
    (provider === "groq" ? "https://api.groq.com/openai/v1" : undefined);
  const apiKey =
    options.apiKey ||
    pickEnv("AI_API_KEY", provider === "groq" ? "GROQ_API_KEY" : undefined, "OPENAI_API_KEY");

  if (!apiKey) {
    throw new Error(`Missing API key for provider "${provider}".`);
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

export function resolveAskModel(preferredModel) {
  return (
    preferredModel ||
    pickEnv(
      "AI_COPILOT_MODEL",
      "AI_MODEL",
      "OPENAI_COPILOT_MODEL",
      "OPENAI_MODEL",
      "OPENAI_CODEGEN_MODEL"
    ) ||
    "gpt-4.1-mini"
  );
}

export function resolveCodegenModel(preferredModel) {
  return (
    preferredModel ||
    pickEnv("AI_CODEGEN_MODEL", "AI_MODEL", "OPENAI_CODEGEN_MODEL", "OPENAI_MODEL") ||
    "gpt-4.1-mini"
  );
}
