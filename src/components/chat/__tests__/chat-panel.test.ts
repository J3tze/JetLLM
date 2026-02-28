import { describe, expect, it } from "vitest"
import {
  getConversationLoadAction,
  shouldReloadCurrentConversation,
  resolveInitialModelSelection,
} from "../chat-panel"

describe("getConversationLoadAction", () => {
  it("loads when first mount already has a conversation id", () => {
    expect(getConversationLoadAction(undefined, "conv-1")).toBe("load")
  })

  it("loads when switching from new chat to an existing conversation", () => {
    expect(getConversationLoadAction(null, "conv-1")).toBe("load")
  })

  it("skips when conversation id is unchanged", () => {
    expect(getConversationLoadAction("conv-1", "conv-1")).toBe("skip")
  })

  it("clears when leaving an existing conversation", () => {
    expect(getConversationLoadAction("conv-1", null)).toBe("clear")
  })
})

describe("shouldReloadCurrentConversation", () => {
  it("rehydrates when the selected conversation has zero local messages", () => {
    expect(shouldReloadCurrentConversation("skip", "conv-1", 0)).toBe(true)
  })

  it("does not rehydrate when message list is non-empty", () => {
    expect(shouldReloadCurrentConversation("skip", "conv-1", 3)).toBe(false)
  })

  it("does not rehydrate when there is no selected conversation", () => {
    expect(shouldReloadCurrentConversation("skip", null, 0)).toBe(false)
  })

  it("does not rehydrate during clear/load transitions", () => {
    expect(shouldReloadCurrentConversation("clear", "conv-1", 0)).toBe(false)
    expect(shouldReloadCurrentConversation("load", "conv-1", 0)).toBe(false)
  })
})

describe("resolveInitialModelSelection", () => {
  it("uses defaults when that provider has a configured key", () => {
    const result = resolveInitialModelSelection(
      { provider: "openrouter", model: "anthropic/claude-sonnet-4.6" },
      {
        openrouter: { hasKey: true },
        openai: { hasKey: false },
      }
    )
    expect(result).toEqual({ provider: "openrouter", model: "anthropic/claude-sonnet-4.6" })
  })

  it("falls back to first configured provider when defaults provider has no key", () => {
    const result = resolveInitialModelSelection(
      { provider: "openai", model: "gpt-4o" },
      {
        openrouter: { hasKey: true },
        openai: { hasKey: false },
      }
    )
    expect(result.provider).toBe("openrouter")
    expect(result.model).toBeTruthy()
  })
})
