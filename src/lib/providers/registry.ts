export type ProviderDef = {
  id: string
  name: string
  sdkPackage: string
  defaultModels: string[]
  supportsCustomBase: boolean
}

export const PROVIDER_REGISTRY: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini"],
    supportsCustomBase: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    sdkPackage: "@ai-sdk/anthropic",
    defaultModels: [
      "claude-sonnet-4-6-20250514",
      "claude-opus-4-6-20250514",
      "claude-sonnet-4-20250514",
      "claude-haiku-4-5-20251001",
    ],
    supportsCustomBase: true,
  },
  {
    id: "google",
    name: "Google Gemini",
    sdkPackage: "@ai-sdk/google",
    defaultModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    supportsCustomBase: false,
  },
  {
    id: "mistral",
    name: "Mistral",
    sdkPackage: "@ai-sdk/mistral",
    defaultModels: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
    supportsCustomBase: false,
  },
  {
    id: "groq",
    name: "Groq",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    supportsCustomBase: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: [],
    supportsCustomBase: true,
  },
  {
    id: "together",
    name: "Together AI",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: [],
    supportsCustomBase: true,
  },
  {
    id: "custom",
    name: "Custom (OpenAI-Compatible)",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: [],
    supportsCustomBase: true,
  },
]
