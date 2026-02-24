import { describe, it, expect, vi, beforeEach } from "vitest"
import { PROVIDER_REGISTRY } from "../registry"

// Mock the settings module
vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(() => null),
}))

// Mock the AI SDK packages to avoid needing actual SDK installs for unit tests
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn(() => ({ modelId: "mock-openai" }))),
}))
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => ({ modelId: "mock-anthropic" }))),
}))
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ modelId: "mock-google" }))),
}))
vi.mock("@ai-sdk/mistral", () => ({
  createMistral: vi.fn(() => vi.fn(() => ({ modelId: "mock-mistral" }))),
}))

describe("Provider Registry", () => {
  const expectedProviderIds = [
    "openai",
    "anthropic",
    "google",
    "mistral",
    "groq",
    "openrouter",
    "together",
    "custom",
  ]

  it("contains all expected providers", () => {
    const ids = PROVIDER_REGISTRY.map((p) => p.id)
    for (const expectedId of expectedProviderIds) {
      expect(ids).toContain(expectedId)
    }
  })

  it("has exactly 8 providers", () => {
    expect(PROVIDER_REGISTRY).toHaveLength(8)
  })

  it.each(expectedProviderIds)("provider '%s' has all required fields", (providerId) => {
    const provider = PROVIDER_REGISTRY.find((p) => p.id === providerId)
    expect(provider).toBeDefined()
    expect(provider!.id).toBeTypeOf("string")
    expect(provider!.name).toBeTypeOf("string")
    expect(provider!.sdkPackage).toBeTypeOf("string")
    expect(Array.isArray(provider!.defaultModels)).toBe(true)
    expect(provider!.supportsCustomBase).toBeTypeOf("boolean")
  })

  it("each provider has a non-empty name", () => {
    for (const provider of PROVIDER_REGISTRY) {
      expect(provider.name.length).toBeGreaterThan(0)
    }
  })

  it("each provider has a valid sdkPackage starting with @ai-sdk/", () => {
    for (const provider of PROVIDER_REGISTRY) {
      expect(provider.sdkPackage).toMatch(/^@ai-sdk\//)
    }
  })
})

describe("getModel", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("throws when no API key is configured for a provider", async () => {
    // Re-mock settings to return null (no config)
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => null),
    }))

    const { getModel } = await import("../index")

    expect(() => getModel("openai", "gpt-4o")).toThrow(
      "No API key configured for provider: openai"
    )
  })

  it("throws when config exists but apiKey is empty", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({ apiKey: "" })),
    }))

    const { getModel } = await import("../index")

    expect(() => getModel("openai", "gpt-4o")).toThrow(
      "No API key configured for provider: openai"
    )
  })

  it("throws for unknown provider", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({ apiKey: "sk-test-key" })),
    }))

    const { getModel } = await import("../index")

    expect(() => getModel("nonexistent", "some-model")).toThrow(
      "Unknown provider: nonexistent"
    )
  })

  it("returns a model for a valid openai provider with API key", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({ apiKey: "sk-test-key" })),
    }))

    const { getModel } = await import("../index")

    const model = getModel("openai", "gpt-4o")
    expect(model).toBeDefined()
  })

  it("returns a model for anthropic provider with API key", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({ apiKey: "sk-ant-test" })),
    }))

    const { getModel } = await import("../index")

    const model = getModel("anthropic", "claude-sonnet-4-20250514")
    expect(model).toBeDefined()
  })

  it("returns a model for google provider with API key", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({ apiKey: "ai-test-key" })),
    }))

    const { getModel } = await import("../index")

    const model = getModel("google", "gemini-2.0-flash")
    expect(model).toBeDefined()
  })

  it("returns a model for mistral provider with API key", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({ apiKey: "mistral-test-key" })),
    }))

    const { getModel } = await import("../index")

    const model = getModel("mistral", "mistral-large-latest")
    expect(model).toBeDefined()
  })

  it("returns a model for groq provider with API key", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({ apiKey: "gsk-test-key" })),
    }))

    const { getModel } = await import("../index")

    const model = getModel("groq", "llama-3.3-70b-versatile")
    expect(model).toBeDefined()
  })

  it("throws for custom provider when no baseUrl is provided", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({ apiKey: "custom-key" })),
    }))

    const { getModel } = await import("../index")

    expect(() => getModel("custom", "some-model")).toThrow(
      "Base URL required for provider: custom"
    )
  })

  it("returns a model for custom provider with baseUrl", async () => {
    vi.doMock("@/lib/settings", () => ({
      getSetting: vi.fn(() => ({
        apiKey: "custom-key",
        baseUrl: "https://my-custom-api.example.com/v1",
      })),
    }))

    const { getModel } = await import("../index")

    const model = getModel("custom", "my-model")
    expect(model).toBeDefined()
  })
})
