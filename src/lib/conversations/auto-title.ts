import { generateText } from "ai"
import { getModel } from "@/lib/providers"
import { getSetting } from "@/lib/settings"
import { getConversation, updateConversation } from "@/lib/conversations"

type ModelConfig = { provider: string; model: string }

export async function autoTitleConversation(
  conversationId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  try {
    const conversation = getConversation(conversationId)
    if (!conversation) return

    // Only auto-title if title is the truncated user message (default from handleSend)
    // or "New Chat" (the DB default)
    const isDefaultTitle = conversation.title === "New Chat" ||
      conversation.title === userMessage.slice(0, 50)
    if (!isDefaultTitle) return

    const modelConfig = getSetting<ModelConfig>("memory:model")
    if (!modelConfig?.provider || !modelConfig?.model) return

    const model = getModel(modelConfig.provider, modelConfig.model)
    const { text } = await generateText({
      model,
      prompt: `Generate a concise title (3-6 words) for this conversation. Respond with only the title, no quotes or punctuation at the end.\n\nUser: ${userMessage.slice(0, 500)}\n\nAssistant: ${assistantMessage.slice(0, 500)}`,
      temperature: 0,
      maxOutputTokens: 30,
    })

    const title = text.trim().replace(/^["']|["']$/g, "").slice(0, 80)
    if (title) {
      updateConversation(conversationId, { title })
    }
  } catch (error) {
    console.error("[auto-title] Failed:", error)
  }
}
