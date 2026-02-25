import { generateText } from "ai"
import { getModel } from "@/lib/providers"
import { getSetting } from "@/lib/settings"
import {
  listMemories,
  createMemory,
  memoryExistsByContent,
} from "@/lib/memory"
import { getMessages } from "@/lib/conversations"
import { buildExtractionPrompt } from "./prompts"

type MemoryModelConfig = {
  provider: string
  model: string
}

type ExtractedMemory = {
  type: "fact" | "preference"
  content: string
}

/**
 * Run memory extraction for a conversation.
 * Called as fire-and-forget from the chat API's onFinish callback.
 */
export async function extractMemories(conversationId: string): Promise<void> {
  try {
    // Check if memory is enabled
    const enabled = getSetting<boolean>("memory:enabled")
    if (enabled === false) return

    // Get extraction model config
    const modelConfig = getSetting<MemoryModelConfig>("memory:model")
    if (!modelConfig?.provider || !modelConfig?.model) return

    // Get conversation messages (last 10 for context)
    const messages = getMessages(conversationId)
    if (messages.length < 2) return

    const recentMessages = messages.slice(-10)
    const formattedMessages = recentMessages
      .map(m => `${m.role}: ${m.content}`)
      .join("\n\n")

    // Get existing memories for dedup
    const existingMemories = listMemories().map(m => m.content)

    // Build prompt and call extraction model
    const prompt = buildExtractionPrompt(existingMemories, formattedMessages)
    const model = getModel(modelConfig.provider, modelConfig.model)
    const { text } = await generateText({
      model,
      prompt,
      temperature: 0,
      maxOutputTokens: 1024,
    })

    // Parse and store new memories
    const parsed = parseExtractionResponse(text)
    for (const memory of parsed) {
      if (!memoryExistsByContent(memory.content)) {
        createMemory({
          type: memory.type,
          content: memory.content,
          sourceConversationId: conversationId,
        })
      }
    }

    if (parsed.length > 0) {
      console.log(`[memory] Extracted ${parsed.length} new memories from conversation ${conversationId}`)
    }
  } catch (error) {
    console.error("[memory] Extraction failed:", error)
  }
}

function parseExtractionResponse(text: string): ExtractedMemory[] {
  try {
    let cleaned = text.trim()
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    }

    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (item: unknown): item is ExtractedMemory =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        "content" in item &&
        ((item as ExtractedMemory).type === "fact" || (item as ExtractedMemory).type === "preference") &&
        typeof (item as ExtractedMemory).content === "string" &&
        (item as ExtractedMemory).content.length > 0 &&
        (item as ExtractedMemory).content.length <= 200
    )
  } catch {
    console.warn("[memory] Failed to parse extraction response:", text.slice(0, 200))
    return []
  }
}
