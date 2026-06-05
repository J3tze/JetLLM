import { describe, it, expect, vi, beforeEach } from "vitest"
import { MAX_CHAT_ATTACHMENT_DATA_URL_CHARS } from "@/lib/chat-attachments"

// Mock the providers module
const mockGetModel = vi.fn()
vi.mock("@/lib/providers", () => ({
  getModel: (...args: unknown[]) => mockGetModel(...args),
}))

// Mock the conversations module
const mockGetConversation = vi.fn()
const mockAddMessage = vi.fn()
const mockDeleteLatestAssistantMessage = vi.fn()
vi.mock("@/lib/conversations", () => ({
  getConversation: (...args: unknown[]) => mockGetConversation(...args),
  addMessage: (...args: unknown[]) => mockAddMessage(...args),
  deleteLatestAssistantMessage: (...args: unknown[]) => mockDeleteLatestAssistantMessage(...args),
}))

// Mock the ai module's streamText and convertToModelMessages
const mockStreamText = vi.fn()
const mockConvertToModelMessages = vi.fn()
const mockTool = vi.fn((definition: unknown) => definition)
const mockGetTextFromDataUrl = vi.fn()
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  convertToModelMessages: (...args: unknown[]) => mockConvertToModelMessages(...args),
  tool: (definition: unknown) => mockTool(definition),
  getTextFromDataUrl: (...args: unknown[]) => mockGetTextFromDataUrl(...args),
}))

const mockExtractMemories = vi.fn()
vi.mock("@/lib/memory/extract", () => ({
  extractMemories: (...args: unknown[]) => mockExtractMemories(...args),
}))

const mockGetCurrentUserFromRequest = vi.fn()
vi.mock("@/lib/auth-server", () => ({
  getCurrentUserFromRequest: (...args: unknown[]) => mockGetCurrentUserFromRequest(...args),
}))

const mockGetSettings = vi.fn()
const mockGetProviderSettings = vi.fn()
vi.mock("@/lib/settings", () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  getProviderSettings: (...args: unknown[]) => mockGetProviderSettings(...args),
}))

describe("POST /api/chat", () => {
  const mockModel = { modelId: "mock-model" }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockGetModel.mockReturnValue(mockModel)
    mockGetConversation.mockReturnValue(undefined)
    mockAddMessage.mockReturnValue(undefined)
    mockDeleteLatestAssistantMessage.mockReturnValue(undefined)
    mockConvertToModelMessages.mockResolvedValue([
      { role: "user", content: "Hello" },
    ])
    mockTool.mockImplementation((definition: unknown) => definition)
    mockExtractMemories.mockResolvedValue(undefined)
    mockGetSettings.mockReturnValue({})
    mockGetProviderSettings.mockReturnValue({})
    mockGetTextFromDataUrl.mockReturnValue("")
    mockGetCurrentUserFromRequest.mockReturnValue({
      id: "user-1",
      email: "user@example.com",
      displayName: "User",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
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
    const providerConfig = { apiKey: "sk-anthropic" }
    mockGetSettings.mockReturnValue({
      "provider:anthropic": providerConfig,
    })

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    })

    await POST(req)

    expect(mockGetModel).toHaveBeenCalledWith(
      "anthropic",
      "claude-sonnet-4-20250514",
      { config: providerConfig }
    )
  })

  it("loads route settings in a single batched lookup", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
    })

    await POST(req)

    expect(mockGetSettings).toHaveBeenCalledWith([
      "chat:systemPrompt",
      "chat:userName",
      "memory:enabled",
      "rag:model",
      "search:tavilyKey",
      "provider:openai",
    ])
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

    expect(mockGetConversation).toHaveBeenCalledWith("conv-123", "user-1")
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("You are a pirate assistant. Speak like a pirate."),
      })
    )
  })

  it("returns 404 when the requested conversation is not owned by the user", async () => {
    const { POST } = await import("../route")
    mockGetConversation.mockReturnValue(undefined)

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
      conversationId: "conv-123",
    })

    const response = await POST(req)
    expect(response.status).toBe(404)
    expect(mockStreamText).not.toHaveBeenCalled()
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
        system: expect.stringContaining("You are a helpful AI assistant."),
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

  it("converts text file parts to bounded text before model conversion", async () => {
    const { POST } = await import("../route")
    mockGetTextFromDataUrl.mockReturnValue("These are the uploaded notes.")

    const req = createRequest({
      messages: [
        {
          role: "user",
          parts: [
            { type: "text", text: "Summarize this file." },
            {
              type: "file",
              mediaType: "text/plain",
              filename: "notes.txt",
              url: "data:text/plain;base64,VGhlc2UgYXJlIHRoZSB1cGxvYWRlZCBub3Rlcy4=",
            },
          ],
        },
      ],
      provider: "openai",
      model: "gpt-4o",
    })

    await POST(req)

    const convertedMessages = mockConvertToModelMessages.mock.calls[0]?.[0] as Array<{
      parts: Array<{ type: string; text?: string; filename?: string }>
    }>
    expect(convertedMessages[0].parts).toEqual([
      { type: "text", text: "Summarize this file." },
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("Attached text file: notes.txt (text/plain)"),
      }),
    ])
    expect(convertedMessages[0].parts.some(part => part.type === "file" && part.filename === "notes.txt")).toBe(false)
  })

  it("keeps image file parts available for vision-capable models", async () => {
    const { POST } = await import("../route")
    const imagePart = {
      type: "file",
      mediaType: "image/png",
      filename: "screenshot.png",
      url: "data:image/png;base64,iVBORw0KGgo=",
    }

    const req = createRequest({
      messages: [
        {
          role: "user",
          parts: [
            { type: "text", text: "What is in this image?" },
            imagePart,
          ],
        },
      ],
      provider: "openai",
      model: "gpt-4o",
    })

    await POST(req)

    const convertedMessages = mockConvertToModelMessages.mock.calls[0]?.[0] as Array<{
      parts: Array<{ type: string; filename?: string }>
    }>
    expect(convertedMessages[0].parts).toContainEqual(imagePart)
  })

  it("rejects oversized attachment payloads before contacting a provider", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "file",
              mediaType: "text/plain",
              filename: "huge.txt",
              url: `data:text/plain;base64,${"a".repeat(MAX_CHAT_ATTACHMENT_DATA_URL_CHARS + 1)}`,
            },
          ],
        },
      ],
      provider: "openai",
      model: "gpt-4o",
    })

    const response = await POST(req)

    expect(response.status).toBe(413)
    expect(mockGetModel).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it("applies high Anthropic thinking budget only when requested", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Think carefully." }],
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      thinkingLevel: "high",
    })

    await POST(req)

    const streamTextArg = mockStreamText.mock.calls[0]?.[0] as {
      temperature?: number
      topP?: number
      maxOutputTokens?: number
      providerOptions?: {
        anthropic?: { thinking?: { type?: string; budgetTokens?: number } }
      }
    }
    expect(streamTextArg.temperature).toBeUndefined()
    expect(streamTextArg.topP).toBeUndefined()
    expect(streamTextArg.maxOutputTokens).toBeGreaterThan(10000)
    expect(streamTextArg.providerOptions?.anthropic?.thinking).toEqual({
      type: "enabled",
      budgetTokens: 10000,
    })
  })

  it("does not auto-enable Anthropic thinking when thinking is off", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      thinkingLevel: "off",
    })

    await POST(req)

    const streamTextArg = mockStreamText.mock.calls[0]?.[0] as {
      temperature?: number
      topP?: number
      providerOptions?: unknown
    }
    expect(streamTextArg.temperature).toBe(0.7)
    expect(streamTextArg.topP).toBe(1)
    expect(streamTextArg.providerOptions).toBeUndefined()
  })

  it("applies OpenAI reasoning effort for direct reasoning models", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Solve this." }],
      provider: "openai",
      model: "o3",
      thinkingLevel: "medium",
    })

    await POST(req)

    const streamTextArg = mockStreamText.mock.calls[0]?.[0] as {
      temperature?: number
      topP?: number
      providerOptions?: { openai?: { reasoningEffort?: string } }
    }
    expect(streamTextArg.temperature).toBeUndefined()
    expect(streamTextArg.topP).toBeUndefined()
    expect(streamTextArg.providerOptions?.openai?.reasoningEffort).toBe("medium")
  })

  it("ignores thinking level for non-reasoning OpenAI models", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
      thinkingLevel: "high",
    })

    await POST(req)

    const streamTextArg = mockStreamText.mock.calls[0]?.[0] as {
      temperature?: number
      topP?: number
      providerOptions?: unknown
    }
    expect(streamTextArg.temperature).toBe(0.7)
    expect(streamTextArg.topP).toBe(1)
    expect(streamTextArg.providerOptions).toBeUndefined()
  })

  it("ignores thinking level for OpenAI-compatible proxy providers", async () => {
    const { POST } = await import("../route")

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openrouter",
      model: "openai/o3",
      thinkingLevel: "high",
    })

    await POST(req)

    const streamTextArg = mockStreamText.mock.calls[0]?.[0] as {
      providerOptions?: unknown
    }
    expect(streamTextArg.providerOptions).toBeUndefined()
  })

  it("deletes the latest assistant message on regenerate requests", async () => {
    const { POST } = await import("../route")
    mockGetConversation.mockReturnValue({ id: "conv-123" })

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
      conversationId: "conv-123",
      trigger: "regenerate-message",
    })

    await POST(req)

    expect(mockDeleteLatestAssistantMessage).toHaveBeenCalledWith("conv-123", "user-1")
  })

  it("returns 400 when provider API key is missing", async () => {
    const { POST } = await import("../route")
    mockGetModel.mockImplementation(() => {
      throw new Error("No API key configured for provider: openai")
    })

    const req = createRequest({
      messages: [{ role: "user", content: "Hello" }],
      provider: "openai",
      model: "gpt-4o",
    })

    const response = await POST(req)
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toBe("No API key configured for provider: openai")
  })

  it("persists tool outputs into assistant metadata on finish", async () => {
    const { POST } = await import("../route")
    mockGetConversation.mockReturnValue({ id: "conv-123" })

    const req = createRequest({
      messages: [{ role: "user", content: "Find recent Crimson Desert updates" }],
      provider: "openai",
      model: "gpt-4o",
      conversationId: "conv-123",
    })

    await POST(req)

    const streamTextArg = mockStreamText.mock.calls[0]?.[0] as {
      onFinish?: (event: {
        text?: string
        toolResults?: unknown[]
      }) => Promise<void>
    }
    expect(streamTextArg.onFinish).toBeTypeOf("function")

    await streamTextArg.onFinish?.({
      text: "Here are the latest updates.",
      toolResults: [
        {
          type: "tool-result",
          toolName: "web_search",
          toolCallId: "call-1",
          input: { query: "Crimson Desert news" },
          output: "Key Updates:\n- [1] Example update\n\nReferences:\n[1] Example Source - https://example.com",
        },
      ],
    })

    expect(mockAddMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        conversationId: "conv-123",
        role: "assistant",
        content: "Here are the latest updates.",
        metadata: expect.any(String),
      })
    )

    const addMessageArg = mockAddMessage.mock.calls[0][0] as { metadata: string }
    const metadata = JSON.parse(addMessageArg.metadata) as { parts: Array<{ type: string }> }

    expect(metadata.parts).toEqual([
      expect.objectContaining({
        type: "tool-web_search",
        state: "output-available",
        toolCallId: "call-1",
        input: { query: "Crimson Desert news" },
      }),
      expect.objectContaining({
        type: "text",
        text: "Here are the latest updates.",
      }),
    ])
    expect(mockExtractMemories).toHaveBeenCalledWith("conv-123", "user-1")
  })
})
