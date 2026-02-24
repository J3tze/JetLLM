import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the providers module
const mockGetModel = vi.fn()
vi.mock("@/lib/providers", () => ({
  getModel: (...args: unknown[]) => mockGetModel(...args),
}))

// Mock the conversations module
const mockGetConversation = vi.fn()
const mockAddMessage = vi.fn()
vi.mock("@/lib/conversations", () => ({
  getConversation: (...args: unknown[]) => mockGetConversation(...args),
  addMessage: (...args: unknown[]) => mockAddMessage(...args),
}))

// Mock the ai module's streamText and convertToModelMessages
const mockStreamText = vi.fn()
const mockConvertToModelMessages = vi.fn()
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  convertToModelMessages: (...args: unknown[]) => mockConvertToModelMessages(...args),
}))

describe("POST /api/chat", () => {
  const mockModel = { modelId: "mock-model" }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockGetModel.mockReturnValue(mockModel)
    mockGetConversation.mockReturnValue(undefined)
    mockAddMessage.mockReturnValue(undefined)
    mockConvertToModelMessages.mockResolvedValue([
      { role: "user", content: "Hello" },
    ])
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: () =>
        new Response("streaming response", { status: 200 }),
    })
  })

  function createRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("returns 400 when provider is missing", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-4o",
    })

    const response = await POST(req)
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json.error).toBe("provider is required")
  })

  it("returns 400 when model is missing", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
    })

    const response = await POST(req)
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json.error).toBe("model is required")
  })

  it("calls getModel with the correct provider and model", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    })

    await POST(req)

    expect(mockGetModel).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-20250514")
  })

  it("uses conversation system prompt when conversationId is provided", async () => {
    const { POST } = await import("../route")

    mockGetConversation.mockReturnValue({
      id: "conv-123",
      systemPrompt: "You are a pirate assistant. Speak like a pirate.",
    })

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
      conversationId: "conv-123",
    })

    await POST(req)

    expect(mockGetConversation).toHaveBeenCalledWith("conv-123")
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "You are a pirate assistant. Speak like a pirate.",
      })
    )
  })

  it("uses default system prompt when no conversationId is provided", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
    })

    await POST(req)

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "You are a helpful AI assistant.",
      })
    )
  })

  it("passes the model returned by getModel to streamText", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
    })

    await POST(req)

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockModel,
      })
    )
  })

  it("returns the streaming response from streamText", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
    })

    const response = await POST(req)
    expect(response.status).toBe(200)

    const text = await response.text()
    expect(text).toBe("streaming response")
  })
})
