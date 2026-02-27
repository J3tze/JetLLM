import { streamText, UIMessage, convertToModelMessages, tool } from "ai"
import { z } from "zod"
import { getModel } from "@/lib/providers"
import { addMessage, getConversation } from "@/lib/conversations"
import { getFormattedMemories } from "@/lib/memory"
import { getSetting } from "@/lib/settings"
import { extractMemories } from "@/lib/memory/extract"
import { searchWeb, formatSearchResults } from "@/lib/search/tavily"

export const maxDuration = 60

// Only enable thinking for DIRECT Anthropic provider, not OpenRouter/other proxies
const THINKING_MODEL_PATTERNS = [
  /^claude-sonnet-4/,
  /^claude-opus-4/,
]

function isThinkingModel(modelId: string): boolean {
  return THINKING_MODEL_PATTERNS.some(p => p.test(modelId))
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      messages,
      conversationId,
      provider,
      model: modelId,
      temperature,
      maxTokens: maxOutputTokens,
      topP,
      webSearch,
    } = body as {
      messages: UIMessage[]
      conversationId?: string
      provider: string
      model: string
      temperature?: number
      maxTokens?: number
      topP?: number
      webSearch?: boolean
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

    // Build system prompt: custom setting > conversation-level > default
    const customSystemPrompt = getSetting<string>("chat:systemPrompt")
    let systemPrompt = customSystemPrompt || "You are a helpful AI assistant."
    if (conversationId) {
      const conversation = getConversation(conversationId)
      if (conversation?.systemPrompt) {
        systemPrompt = conversation.systemPrompt
      }
    }

    // Inject user name if configured
    const userName = getSetting<string>("chat:userName")
    if (userName) {
      systemPrompt = systemPrompt + `\n\nThe user's name is ${userName}.`
    }

    // Inject memories into system prompt
    const memoryEnabled = getSetting<boolean>("memory:enabled")
    if (memoryEnabled !== false) {
      const memoryContext = getFormattedMemories()
      if (memoryContext) {
        systemPrompt = systemPrompt + "\n\n" + memoryContext
      }
    }

    // Web search: check if API key is configured
    const tavilyKey = getSetting<string>("search:tavilyKey")

    // Always-search mode: pre-fetch results into system prompt
    if (webSearch && tavilyKey) {
      const lastUserMessage = messages.filter(m => m.role === "user").pop()
      if (lastUserMessage) {
        const query = typeof lastUserMessage.content === "string"
          ? lastUserMessage.content
          : ""
        try {
          const results = await searchWeb(query.slice(0, 200))
          const searchContext = formatSearchResults(results)
          if (searchContext) {
            systemPrompt = systemPrompt + "\n\n" + searchContext
          }
        } catch (err) {
          console.error("[chat] Web search pre-fetch error:", err)
        }
      }
    }

    const llmModel = getModel(provider, modelId)
    // Only treat as thinking model when using direct Anthropic provider
    const thinking = provider === "anthropic" && isThinkingModel(modelId)

    const result = streamText({
      model: llmModel,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      // Web search tool (only when API key configured)
      ...(tavilyKey ? {
        tools: {
          web_search: tool({
            description: "Search the web for current information. Use when the user asks about recent events, needs up-to-date data, or when your training data may be outdated.",
            parameters: z.object({
              query: z.string().describe("The search query"),
            }),
            execute: async ({ query }) => {
              try {
                const results = await searchWeb(query)
                return results.map(r => `### ${r.title}\n${r.url}\n${r.content}`).join("\n\n")
              } catch (err) {
                return `Search failed: ${err instanceof Error ? err.message : "Unknown error"}`
              }
            },
          }),
        },
        maxSteps: 3,
      } : {}),
      // Thinking models don't support temperature/topP
      ...(thinking
        ? { maxOutputTokens: maxOutputTokens ?? 16384 }
        : {
            temperature: temperature ?? 0.7,
            maxOutputTokens: maxOutputTokens ?? 4096,
            topP: topP ?? 1,
          }),
      // Enable thinking for direct Anthropic provider
      ...(thinking && {
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled" as const, budgetTokens: 10000 },
          },
        },
      }),
      onFinish: async ({ text }) => {
        if (conversationId && text) {
          addMessage({
            conversationId,
            role: "assistant",
            content: text,
          })
          // Fire-and-forget memory extraction
          extractMemories(conversationId).catch((err) => {
            console.error("[memory] Background extraction error:", err)
          })
        }
      },
    })

    return result.toUIMessageStreamResponse({ sendReasoning: true })
  } catch (error) {
    console.error("[chat] Error:", error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
