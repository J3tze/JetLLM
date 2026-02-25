import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("ai", () => ({
  generateText: vi.fn(),
}))
vi.mock("@/lib/providers", () => ({
  getModel: vi.fn(),
}))
vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(),
}))
vi.mock("@/lib/memory", () => ({
  listMemories: vi.fn(),
  createMemory: vi.fn(),
  memoryExistsByContent: vi.fn(),
}))
vi.mock("@/lib/conversations", () => ({
  getMessages: vi.fn(),
}))

import { extractMemories } from "../extract"
import { generateText } from "ai"
import { getSetting } from "@/lib/settings"
import { getModel } from "@/lib/providers"
import { listMemories, createMemory, memoryExistsByContent } from "@/lib/memory"
import { getMessages } from "@/lib/conversations"

function mockMessage(role: string, content: string) {
  return { id: "1", conversationId: "c1", role, content, toolCalls: null, metadata: null, createdAt: new Date() }
}

describe("extractMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("skips when memory:enabled is false", async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === "memory:enabled") return false
      return null
    })
    await extractMemories("conv-1")
    expect(generateText).not.toHaveBeenCalled()
  })

  it("skips when no extraction model configured", async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === "memory:enabled") return true
      if (key === "memory:model") return null
      return null
    })
    await extractMemories("conv-1")
    expect(generateText).not.toHaveBeenCalled()
  })

  it("skips when fewer than 2 messages", async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === "memory:enabled") return true
      if (key === "memory:model") return { provider: "openai", model: "gpt-4o-mini" }
      return null
    })
    vi.mocked(getMessages).mockReturnValue([mockMessage("user", "hi")] as never)
    await extractMemories("conv-1")
    expect(generateText).not.toHaveBeenCalled()
  })

  it("extracts and stores new memories", async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === "memory:enabled") return true
      if (key === "memory:model") return { provider: "openai", model: "gpt-4o-mini" }
      return null
    })
    vi.mocked(getMessages).mockReturnValue([
      mockMessage("user", "My name is Jetze"),
      mockMessage("assistant", "Nice to meet you Jetze!"),
    ] as never)
    vi.mocked(listMemories).mockReturnValue([])
    vi.mocked(memoryExistsByContent).mockReturnValue(false)
    vi.mocked(getModel).mockReturnValue({} as never)
    vi.mocked(generateText).mockResolvedValue({
      text: '[{"type":"fact","content":"User\'s name is Jetze"}]',
    } as never)

    await extractMemories("c1")

    expect(createMemory).toHaveBeenCalledWith({
      type: "fact",
      content: "User's name is Jetze",
      sourceConversationId: "c1",
    })
  })

  it("deduplicates by exact content match", async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === "memory:enabled") return true
      if (key === "memory:model") return { provider: "openai", model: "gpt-4o-mini" }
      return null
    })
    vi.mocked(getMessages).mockReturnValue([
      mockMessage("user", "test"),
      mockMessage("assistant", "test"),
    ] as never)
    vi.mocked(listMemories).mockReturnValue([])
    vi.mocked(memoryExistsByContent).mockReturnValue(true)
    vi.mocked(getModel).mockReturnValue({} as never)
    vi.mocked(generateText).mockResolvedValue({
      text: '[{"type":"fact","content":"Already exists"}]',
    } as never)

    await extractMemories("c1")
    expect(createMemory).not.toHaveBeenCalled()
  })

  it("handles malformed LLM response gracefully", async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === "memory:enabled") return true
      if (key === "memory:model") return { provider: "openai", model: "gpt-4o-mini" }
      return null
    })
    vi.mocked(getMessages).mockReturnValue([
      mockMessage("user", "test"),
      mockMessage("assistant", "test"),
    ] as never)
    vi.mocked(listMemories).mockReturnValue([])
    vi.mocked(getModel).mockReturnValue({} as never)
    vi.mocked(generateText).mockResolvedValue({
      text: "I couldn't extract anything meaningful here.",
    } as never)

    await expect(extractMemories("c1")).resolves.not.toThrow()
    expect(createMemory).not.toHaveBeenCalled()
  })

  it("handles markdown-wrapped JSON response", async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === "memory:enabled") return true
      if (key === "memory:model") return { provider: "openai", model: "gpt-4o-mini" }
      return null
    })
    vi.mocked(getMessages).mockReturnValue([
      mockMessage("user", "I work at Acme"),
      mockMessage("assistant", "Cool!"),
    ] as never)
    vi.mocked(listMemories).mockReturnValue([])
    vi.mocked(memoryExistsByContent).mockReturnValue(false)
    vi.mocked(getModel).mockReturnValue({} as never)
    vi.mocked(generateText).mockResolvedValue({
      text: '```json\n[{"type":"fact","content":"User works at Acme"}]\n```',
    } as never)

    await extractMemories("c1")
    expect(createMemory).toHaveBeenCalledWith({
      type: "fact",
      content: "User works at Acme",
      sourceConversationId: "c1",
    })
  })
})
