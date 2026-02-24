import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createMistral } from "@ai-sdk/mistral"
import { getSetting, ProviderConfig } from "@/lib/settings"
import { LanguageModel } from "ai"

export { PROVIDER_REGISTRY } from "./registry"

const PROVIDER_BASE_URLS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
}

export function getModel(providerId: string, modelId: string): LanguageModel {
  const config = getSetting<ProviderConfig>(`provider:${providerId}`)
  if (!config?.apiKey) {
    throw new Error(`No API key configured for provider: ${providerId}`)
  }

  switch (providerId) {
    case "openai": {
      const provider = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl }),
      })
      return provider(modelId)
    }
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl }),
      })
      return provider(modelId)
    }
    case "google": {
      const provider = createGoogleGenerativeAI({
        apiKey: config.apiKey,
      })
      return provider(modelId)
    }
    case "mistral": {
      const provider = createMistral({
        apiKey: config.apiKey,
      })
      return provider(modelId)
    }
    case "groq":
    case "openrouter":
    case "together":
    case "custom": {
      const baseURL = config.baseUrl || PROVIDER_BASE_URLS[providerId]
      if (!baseURL) {
        throw new Error(`Base URL required for provider: ${providerId}`)
      }
      const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL,
      })
      return provider.chat(modelId)
    }
    default:
      throw new Error(`Unknown provider: ${providerId}`)
  }
}
