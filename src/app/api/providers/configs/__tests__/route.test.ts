import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetProviderSettings = vi.fn()
const mockGetSetting = vi.fn()
const mockSetSetting = vi.fn()

vi.mock("@/lib/settings", () => ({
  getProviderSettings: (...args: unknown[]) => mockGetProviderSettings(...args),
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}))

const mockGetCurrentUserFromRequest = vi.fn()
vi.mock("@/lib/auth-server", () => ({
  getCurrentUserFromRequest: (...args: unknown[]) => mockGetCurrentUserFromRequest(...args),
}))

function createPutRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/providers/configs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createGetRequest(): Request {
  return new Request("http://localhost:3000/api/providers/configs", {
    method: "GET",
  })
}

describe("/api/providers/configs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserFromRequest.mockReturnValue({
      id: "user-1",
      email: "user@example.com",
      displayName: "User",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it("preserves existing API key when payload omits apiKey", async () => {
    const { PUT } = await import("../route")

    mockGetSetting.mockReturnValue({
      apiKey: "sk-existing",
      baseUrl: "https://api.old.example/v1",
    })

    const response = await PUT(
      createPutRequest({
        providerId: "openai",
        config: { baseUrl: "https://api.new.example/v1" },
      })
    )

    expect(response.status).toBe(200)
    expect(mockSetSetting).toHaveBeenCalledWith("provider:openai", {
      apiKey: "sk-existing",
      baseUrl: "https://api.new.example/v1",
    })
  })

  it("preserves existing API key when payload sends an empty apiKey", async () => {
    const { PUT } = await import("../route")

    mockGetSetting.mockReturnValue({
      apiKey: "sk-existing",
      baseUrl: "https://api.old.example/v1",
    })

    const response = await PUT(
      createPutRequest({
        providerId: "openai",
        config: { apiKey: "", baseUrl: "https://api.new.example/v1" },
      })
    )

    expect(response.status).toBe(200)
    expect(mockSetSetting).toHaveBeenCalledWith("provider:openai", {
      apiKey: "sk-existing",
      baseUrl: "https://api.new.example/v1",
    })
  })

  it("updates API key when payload provides a new non-empty key", async () => {
    const { PUT } = await import("../route")

    mockGetSetting.mockReturnValue({
      apiKey: "sk-existing",
      baseUrl: "https://api.old.example/v1",
    })

    const response = await PUT(
      createPutRequest({
        providerId: "openai",
        config: { apiKey: "sk-new", baseUrl: "https://api.new.example/v1" },
      })
    )

    expect(response.status).toBe(200)
    expect(mockSetSetting).toHaveBeenCalledWith("provider:openai", {
      apiKey: "sk-new",
      baseUrl: "https://api.new.example/v1",
    })
  })

  it("preserves existing API key when payload sends a masked placeholder", async () => {
    const { PUT } = await import("../route")

    mockGetSetting.mockReturnValue({
      apiKey: "sk-existing",
      baseUrl: "https://api.old.example/v1",
    })

    const response = await PUT(
      createPutRequest({
        providerId: "openai",
        config: { apiKey: "********", baseUrl: "https://api.new.example/v1" },
      })
    )

    expect(response.status).toBe(200)
    expect(mockSetSetting).toHaveBeenCalledWith("provider:openai", {
      apiKey: "sk-existing",
      baseUrl: "https://api.new.example/v1",
    })
  })

  it("returns provider summaries from batched provider settings", async () => {
    const { GET } = await import("../route")

    mockGetProviderSettings.mockReturnValue({
      openai: {
        apiKey: "sk-existing",
        baseUrl: "https://api.openai.example/v1",
      },
      anthropic: {
        apiKey: "",
      },
    })

    const response = await GET(createGetRequest())
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(mockGetProviderSettings).toHaveBeenCalled()
    expect(json.openai).toEqual({
      hasKey: true,
      baseUrl: "https://api.openai.example/v1",
    })
    expect(json.anthropic).toEqual({
      hasKey: false,
    })
  })
})
