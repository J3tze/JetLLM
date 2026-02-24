import { streamText, UIMessage, convertToModelMessages } from "ai"
import { getModel } from "@/lib/providers"
import { addMessage, getConversation } from "@/lib/conversations"

export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json()
  const {
    messages,
    conversationId,
    provider,
    model: modelId,
    temperature,
    maxTokens,
    topP,
  } = body as {
    messages: UIMessage[]
    conversationId?: string
    provider: string
    model: string
    temperature?: number
    maxTokens?: number
    topP?: number
  }

  if (!provider) {
    return new Response(JSON.stringify({ error: "provider is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!modelId) {
    return new Response(JSON.stringify({ error: "model is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Get conversation-level system prompt if available
  let systemPrompt = "You are a helpful AI assistant."
  if (conversationId) {
    const conversation = getConversation(conversationId)
    if (conversation?.systemPrompt) {
      systemPrompt = conversation.systemPrompt
    }
  }

  const llmModel = getModel(provider, modelId)

  const result = streamText({
    model: llmModel,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    temperature: temperature ?? 0.7,
    maxTokens: maxTokens ?? 4096,
    topP: topP ?? 1,
    onFinish: async ({ text }) => {
      if (conversationId && text) {
        addMessage({
          conversationId,
          role: "assistant",
          content: text,
        })
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
