import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetSetting = vi.fn()
const mockSetSetting = vi.fn()

vi.mock("@/lib/settings", () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}))

function createPutRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/providers/configs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PUT /api/providers/configs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
