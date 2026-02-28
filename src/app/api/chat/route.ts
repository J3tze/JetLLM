import { streamText, UIMessage, convertToModelMessages, tool } from "ai"
import { z } from "zod"
import { getModel } from "@/lib/providers"
import { addMessage, deleteLatestAssistantMessage, getConversation } from "@/lib/conversations"
import { getFormattedMemories } from "@/lib/memory"
import { getSetting } from "@/lib/settings"
import { extractMemories } from "@/lib/memory/extract"
import { searchWeb, formatSearchResults, formatSearchToolSummary } from "@/lib/search/tavily"
import { getProject } from "@/lib/projects"
import { searchDocuments, formatRagContext } from "@/lib/rag/search"
import { autoTitleConversation } from "@/lib/conversations/auto-title"

export const maxDuration = 60

// Only enable thinking for DIRECT Anthropic provider, not OpenRouter/other proxies
const THINKING_MODEL_PATTERNS = [
  /^claude-sonnet-4/,
  /^claude-opus-4/,
]

type PersistedMessagePart = {
  type: string
  [key: string]: unknown
}

function isThinkingModel(modelId: string): boolean {
  return THINKING_MODEL_PATTERNS.some(p => p.test(modelId))
}

function getMessageText(message: UIMessage): string {
  const partText = (message.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map(part => part.text)
    .join("")

  if (partText) return partText

  const legacyContent = (message as { content?: unknown }).content
  return typeof legacyContent === "string" ? legacyContent : ""
}

function buildAssistantParts(options: {
  text: string
  toolResults: Array<{
    type?: string
    toolName?: string
    toolCallId?: string
    input?: unknown
    output?: unknown
    preliminary?: boolean
    providerExecuted?: boolean
  }>
}): PersistedMessagePart[] {
  const parts: PersistedMessagePart[] = []

  for (const result of options.toolResults) {
    if (result.type !== "tool-result" || !result.toolName || !result.toolCallId) continue

    parts.push({
      type: `tool-${result.toolName}`,
      toolCallId: result.toolCallId,
      state: "output-available",
      input: result.input,
      output: result.output,
      ...(typeof result.preliminary === "boolean" ? { preliminary: result.preliminary } : {}),
      ...(typeof result.providerExecuted === "boolean" ? { providerExecuted: result.providerExecuted } : {}),
    })
  }

  if (options.text) {
    parts.push({ type: "text", text: options.text })
  }

  return parts
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
      trigger,
    } = body as {
      messages: UIMessage[]
      conversationId?: string
      provider: string
      model: string
      temperature?: number
      maxTokens?: number
      topP?: number
      webSearch?: boolean
      trigger?: string
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

    // Regenerate requests replace the most recent assistant reply.
    // Remove it first so history stays linear in the DB.
    if (trigger === "regenerate-message" && conversationId) {
      deleteLatestAssistantMessage(conversationId)
    }

    const conversation = conversationId ? getConversation(conversationId) : undefined
    const userMessages = messages.filter(m => m.role === "user")
    const lastUserMessage = userMessages[userMessages.length - 1]
    const lastUserText = lastUserMessage ? getMessageText(lastUserMessage) : ""
    const firstUserText = userMessages[0] ? getMessageText(userMessages[0]) : ""
    const isFirstAssistantTurn = userMessages.length > 0 && messages.every(m => m.role !== "assistant")
    const modelMessages = messages.map(m => ({
      ...m,
      parts: (m.parts && m.parts.length > 0)
        ? m.parts
        : [{ type: "text" as const, text: getMessageText(m) }],
    }))

    // Build system prompt: custom setting > conversation-level > default
    const customSystemPrompt = getSetting<string>("chat:systemPrompt")
    let systemPrompt = customSystemPrompt || "You are a helpful AI assistant."
    if (conversation?.systemPrompt) {
      systemPrompt = conversation.systemPrompt
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

    // Inject project context and RAG document search
    if (conversation?.projectId) {
      const project = getProject(conversation.projectId)
      // Inject project system prompt
      if (project?.systemPrompt) {
        systemPrompt = systemPrompt + "\n\n" + project.systemPrompt
      }
      // RAG: search project documents for relevant context
      const ragModel = getSetting<{ provider: string; model: string }>("rag:model")
      if (ragModel?.provider && ragModel?.model) {
        try {
          if (lastUserText) {
            const results = await searchDocuments(conversation.projectId, lastUserText)
            const ragContext = formatRagContext(results)
            if (ragContext) {
              systemPrompt = systemPrompt + "\n\n" + ragContext
            }
          }
        } catch (err) {
          console.error("[chat] RAG search error:", err)
        }
      }
    }

    // Web search: check if API key is configured
    const tavilyKey = getSetting<string>("search:tavilyKey")
    if (tavilyKey) {
      systemPrompt = systemPrompt + "\n\nWhen web-search evidence is available, respond with a concise summary in bullet points followed by a References section that uses numbered citations like [1], [2]. Paraphrase findings and avoid copying snippets verbatim."
    }

    // Always-search mode: pre-fetch results into system prompt
    if (webSearch && tavilyKey && lastUserText) {
      try {
        const results = await searchWeb(lastUserText.slice(0, 200))
        const searchContext = formatSearchResults(results)
        if (searchContext) {
          systemPrompt = systemPrompt + "\n\n" + searchContext
        }
      } catch (err) {
        console.error("[chat] Web search pre-fetch error:", err)
        const errMsg = err instanceof Error ? err.message : "Unknown error"
        systemPrompt = systemPrompt + `\n\n## Web Search Failed\nThe user had web search enabled but the search failed with error: "${errMsg}". Let the user know the search didn't work and suggest they check their Tavily API key in Settings if the error is authentication-related.`
      }
    }

    const llmModel = getModel(provider, modelId)
    // Only treat as thinking model when using direct Anthropic provider
    const thinking = provider === "anthropic" && isThinkingModel(modelId)

    const result = streamText({
      model: llmModel,
      system: systemPrompt,
      messages: await convertToModelMessages(modelMessages),
      // Web search tool (only when API key configured)
      ...(tavilyKey ? {
        tools: {
          web_search: tool({
            description: "Search the web for current information. Use when the user asks about recent events, needs up-to-date data, or when your training data may be outdated.",
            inputSchema: z.object({
              query: z.string().describe("The search query"),
            }),
            execute: async ({ query }: { query: string }) => {
              try {
                const results = await searchWeb(query)
                return formatSearchToolSummary(results)
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
      onFinish: async (event) => {
        const text = event.text ?? ""
        const toolResults = Array.isArray(event.toolResults)
          ? event.toolResults as Array<{
            type?: string
            toolName?: string
            toolCallId?: string
            input?: unknown
            output?: unknown
            preliminary?: boolean
            providerExecuted?: boolean
          }>
          : []

        if (conversationId && (text || toolResults.length > 0)) {
          const persistedParts = buildAssistantParts({ text, toolResults })

          addMessage({
            conversationId,
            role: "assistant",
            content: text,
            metadata: JSON.stringify({ parts: persistedParts }),
          })
          // Fire-and-forget memory extraction
          extractMemories(conversationId).catch((err) => {
            console.error("[memory] Background extraction error:", err)
          })
          // Auto-title on first assistant response
          if (isFirstAssistantTurn && text) {
            autoTitleConversation(conversationId, firstUserText, text).catch((err) => {
              console.error("[auto-title] Background error:", err)
            })
          }
        }
      },
    })

    return result.toUIMessageStreamResponse({ sendReasoning: true })
  } catch (error) {
    if (error instanceof Error && /^No API key configured for provider: /.test(error.message)) {
      return new Response(
        JSON.stringify({
          error: error.message,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }
    console.error("[chat] Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
        stack: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
