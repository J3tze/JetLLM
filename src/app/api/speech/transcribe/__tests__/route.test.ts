import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetSetting = vi.fn()
vi.mock("@/lib/settings", () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}))

const mockGetCurrentUserFromRequest = vi.fn()
vi.mock("@/lib/auth-server", () => ({
  getCurrentUserFromRequest: (...args: unknown[]) => mockGetCurrentUserFromRequest(...args),
}))

function createAudioRequest(formData?: FormData): Request {
  const payload = formData ?? new FormData()
  return new Request("http://localhost:3000/api/speech/transcribe", {
    method: "POST",
    body: payload,
  })
}

function buildAudioFormData(): FormData {
  const formData = new FormData()
  formData.append("audio", new Blob(["test-audio"], { type: "audio/webm" }), "recording.webm")
  return formData
}

describe("POST /api/speech/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserFromRequest.mockReturnValue({
      id: "user-1",
      email: "user@example.com",
      displayName: "User",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mockGetSetting.mockImplementation((key: string) => {
      if (key === "provider:groq") return { apiKey: "groq-key" }
      return null
    })
    vi.stubGlobal("fetch", vi.fn())
  })

  it("returns 401 for unauthenticated requests", async () => {
    mockGetCurrentUserFromRequest.mockReturnValue(null)
    const { POST } = await import("../route")

    const response = await POST(createAudioRequest(buildAudioFormData()))

    expect(response.status).toBe(401)
  })

  it("returns 400 when no audio blob is provided", async () => {
    const { POST } = await import("../route")

    const response = await POST(createAudioRequest())
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json.error).toBe("Missing audio file.")
  })

  it("uses Groq first when configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "hello world" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", mockFetch)
    const { POST } = await import("../route")

    const response = await POST(createAudioRequest(buildAudioFormData()))
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json.text).toBe("hello world")
    expect(json.provider).toBe("groq")
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("falls back to OpenAI when Groq fails", async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === "provider:groq") return { apiKey: "groq-key" }
      if (key === "provider:openai") return { apiKey: "openai-key" }
      return null
    })

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "invalid key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "from openai" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    vi.stubGlobal("fetch", mockFetch)
    const { POST } = await import("../route")

    const response = await POST(createAudioRequest(buildAudioFormData()))
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json.text).toBe("from openai")
    expect(json.provider).toBe("openai")
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("returns 400 when no supported provider key is configured", async () => {
    mockGetSetting.mockReturnValue(null)
    const { POST } = await import("../route")

    const response = await POST(createAudioRequest(buildAudioFormData()))
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json.error).toContain("No speech-to-text provider configured")
  })
})
