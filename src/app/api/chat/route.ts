import { streamText, convertToModelMessages, getTextFromDataUrl, tool } from "ai"
import type { UIMessage } from "ai"
import { z } from "zod"
import { getModel } from "@/lib/providers"
import { addMessage, deleteLatestAssistantMessage, getConversation } from "@/lib/conversations"
import { getFormattedMemories } from "@/lib/memory"
import { getProviderSettings, getSettings, type ProviderConfig } from "@/lib/settings"
import { extractMemories } from "@/lib/memory/extract"
import { searchWeb, formatSearchResults, formatSearchToolSummary } from "@/lib/search/tavily"
import { getProject } from "@/lib/projects"
import { searchDocuments, formatRagContext } from "@/lib/rag/search"
import { autoTitleConversation } from "@/lib/conversations/auto-title"
import { getCurrentUserFromRequest } from "@/lib/auth-server"
import {
  MAX_CHAT_ATTACHMENT_DATA_URL_CHARS,
  MAX_TEXT_ATTACHMENT_CHARS,
  MAX_TOTAL_TEXT_ATTACHMENT_CHARS,
  isImageAttachment,
  isTextDocument,
} from "@/lib/chat-attachments"
import { normalizeThinkingLevel, type ThinkingLevel } from "@/lib/thinking"

export const maxDuration = 60

const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_OUTPUT_TOKENS = 4096
const THINKING_MAX_OUTPUT_TOKENS = 16384

// Only enable thinking for direct providers, not OpenRouter/other proxies.
const ANTHROPIC_THINKING_MODEL_PATTERNS = [
  /^claude-sonnet-4/,
  /^claude-opus-4/,
]

const OPENAI_REASONING_MODEL_PATTERNS = [
  /^(?:o1|o3|o4)(?:$|[-_])/i,
  /^gpt-5(?:$|[-_])/i,
]

const ANTHROPIC_THINKING_BUDGETS: Record<Exclude<ThinkingLevel, "off">, number> = {
  low: 1024,
  medium: 4096,
  high: 10000,
}

type ThinkingProviderOptions = {
  anthropic?: {
    thinking: { type: "enabled"; budgetTokens: number }
  }
  openai?: {
    reasoningEffort: Exclude<ThinkingLevel, "off">
  }
}

type ThinkingRequestConfig = {
  providerOptions?: ThinkingProviderOptions
  omitSampling: boolean
  maxOutputTokens?: number
}
type PersistedMessagePart = {
  type: string
  [key: string]: unknown
}

type ChatFilePart = {
  type: "file"
  mediaType?: unknown
  filename?: unknown
  url?: unknown
}

type RagModelConfig = {
  provider: string
  model: string
}

type ChatRouteConfig = {
  customSystemPrompt: string | null
  userName: string | null
  memoryEnabled: boolean | null
  ragModel: RagModelConfig | null
  tavilyKey: string | null
  providerConfig: ProviderConfig | null
}

function isAnthropicThinkingModel(modelId: string): boolean {
  return ANTHROPIC_THINKING_MODEL_PATTERNS.some(p => p.test(modelId))
}

function isOpenAIReasoningModel(modelId: string): boolean {
  return OPENAI_REASONING_MODEL_PATTERNS.some(p => p.test(modelId))
}

function buildThinkingRequestConfig(
  provider: string,
  modelId: string,
  level: ThinkingLevel,
  requestedMaxOutputTokens?: number
): ThinkingRequestConfig {
  if (level === "off") {
    return { omitSampling: false }
  }

  if (provider === "anthropic" && isAnthropicThinkingModel(modelId)) {
    const budgetTokens = ANTHROPIC_THINKING_BUDGETS[level]
    return {
      providerOptions: {
        anthropic: {
          thinking: { type: "enabled", budgetTokens },
        },
      },
      omitSampling: true,
      maxOutputTokens: Math.max(requestedMaxOutputTokens ?? THINKING_MAX_OUTPUT_TOKENS, budgetTokens + 1024),
    }
  }

  if (provider === "openai" && isOpenAIReasoningModel(modelId)) {
    return {
      providerOptions: {
        openai: {
          reasoningEffort: level,
        },
      },
      omitSampling: true,
      maxOutputTokens: requestedMaxOutputTokens ?? THINKING_MAX_OUTPUT_TOKENS,
    }
  }

  return { omitSampling: false }
}

function isTextDocumentFilePart(part: { mediaType?: unknown; filename?: unknown }): boolean {
  const mediaType = typeof part.mediaType === "string" ? part.mediaType.toLowerCase() : ""
  const filename = typeof part.filename === "string" ? part.filename : ""
  return isTextDocument(mediaType, filename)
}

function getFilePartText(part: { url?: unknown }): string {
  if (typeof part.url !== "string" || !part.url.startsWith("data:")) {
    return ""
  }
  try {
    return getTextFromDataUrl(part.url).trim()
  } catch {
    return ""
  }
}

function getFilePartLabel(part: { filename?: unknown; mediaType?: unknown }): string {
  const filename = typeof part.filename === "string" && part.filename.trim()
    ? part.filename.trim()
    : "attachment"
  const mediaType = typeof part.mediaType === "string" && part.mediaType.trim()
    ? part.mediaType.trim()
    : "unknown type"
  return `${filename} (${mediaType})`
}

function createAttachmentTextPart(text: string): UIMessage["parts"][number] {
  return { type: "text", text } as UIMessage["parts"][number]
}

function validateIncomingAttachments(messages: UIMessage[]): Response | null {
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type !== "file") continue
      const filePart = part as ChatFilePart
      if (typeof filePart.url !== "string" || !filePart.url.startsWith("data:")) continue
      if (filePart.url.length > MAX_CHAT_ATTACHMENT_DATA_URL_CHARS) {
        return new Response(
          JSON.stringify({
            error: `Attachment ${getFilePartLabel(filePart)} is too large to send reliably. Use a smaller file or split it into sections.`,
          }),
          { status: 413, headers: { "Content-Type": "application/json" } }
        )
      }
    }
  }

  return null
}

function normalizeTextFilePartForModel(
  part: ChatFilePart,
  remainingTextChars: { value: number }
): UIMessage["parts"][number] {
  const label = getFilePartLabel(part)
  const text = getFilePartText(part)

  if (!text) {
    return createAttachmentTextPart(`[Attached text file: ${label}. The file could not be decoded, so its contents were not included.]`)
  }

  if (remainingTextChars.value <= 0) {
    return createAttachmentTextPart(`[Attached text file: ${label}. Contents omitted because the per-message attachment text limit was reached.]`)
  }

  const charLimit = Math.min(MAX_TEXT_ATTACHMENT_CHARS, remainingTextChars.value)
  const includedText = text.slice(0, charLimit)
  remainingTextChars.value -= includedText.length

  const omittedChars = text.length - includedText.length
  const truncationNote = omittedChars > 0
    ? `\n\n[Attachment truncated: ${omittedChars.toLocaleString()} characters omitted to keep the chat responsive.]`
    : ""

  return createAttachmentTextPart(`Attached text file: ${label}\n\n${includedText}${truncationNote}`)
}

function normalizeMessagePartsForModel(messages: UIMessage[]): UIMessage[] {
  const remainingTextChars = { value: MAX_TOTAL_TEXT_ATTACHMENT_CHARS }

  return messages.map((message) => {
    const sourceParts = message.parts && message.parts.length > 0
      ? message.parts
      : [{ type: "text" as const, text: getMessageText(message) }]

    const parts = sourceParts.flatMap((part): UIMessage["parts"] => {
      if (part.type !== "file") {
        return [part] as UIMessage["parts"]
      }

      const filePart = part as ChatFilePart
      const mediaType = typeof filePart.mediaType === "string" ? filePart.mediaType : ""
      const filename = typeof filePart.filename === "string" ? filePart.filename : undefined

      if (isTextDocument(mediaType, filename)) {
        return [normalizeTextFilePartForModel(filePart, remainingTextChars)] as UIMessage["parts"]
      }

      if (mediaType && isImageAttachment(mediaType)) {
        return [part] as UIMessage["parts"]
      }

      return [createAttachmentTextPart(`[Attached file: ${getFilePartLabel(filePart)}. This file type is not supported by the selected model and was not sent as raw binary.]`)] as UIMessage["parts"]
    })

    return {
      ...message,
      parts,
    }
  })
}

function getMessageText(message: UIMessage): string {
  const textParts = (message.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map(part => part.text)
    .join("\n")

  const textFileParts = (message.parts ?? [])
    .filter((part): part is { type: "file"; mediaType: string; filename?: string; url: string } => {
      return part.type === "file" && isTextDocumentFilePart(part)
    })
    .map(part => getFilePartText(part))
    .filter(Boolean)
    .join("\n\n")

  const combinedText = [textParts, textFileParts].filter(Boolean).join("\n\n")
  if (combinedText) return combinedText

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

function readStringSetting(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function readBooleanSetting(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function readRagModelConfig(value: unknown): RagModelConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const provider = typeof (value as { provider?: unknown }).provider === "string"
    ? (value as { provider: string }).provider
    : null
  const model = typeof (value as { model?: unknown }).model === "string"
    ? (value as { model: string }).model
    : null

  if (!provider || !model) {
    return null
  }

  return { provider, model }
}

function readProviderConfig(value: unknown): ProviderConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as ProviderConfig
}

function loadChatRouteConfig(providerId: string): ChatRouteConfig {
  const settings = getSettings([
    "chat:systemPrompt",
    "chat:userName",
    "memory:enabled",
    "rag:model",
    "search:tavilyKey",
    `provider:${providerId}`,
  ])

  return {
    customSystemPrompt: readStringSetting(settings["chat:systemPrompt"]),
    userName: readStringSetting(settings["chat:userName"]),
    memoryEnabled: readBooleanSetting(settings["memory:enabled"]),
    ragModel: readRagModelConfig(settings["rag:model"]),
    tavilyKey: readStringSetting(settings["search:tavilyKey"]),
    providerConfig: readProviderConfig(settings[`provider:${providerId}`]),
  }
}

function loadRagProviderConfig(
  ragModel: RagModelConfig | null,
  chatProviderId: string,
  chatProviderConfig: ProviderConfig | null
): ProviderConfig | null {
  if (!ragModel) {
    return null
  }

  if (ragModel.provider === chatProviderId) {
    return chatProviderConfig
  }

  return getProviderSettings([ragModel.provider])[ragModel.provider] ?? null
}

export async function POST(req: Request) {
  try {
    const user = getCurrentUserFromRequest(req)
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

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
      thinkingLevel: rawThinkingLevel,
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
      thinkingLevel?: unknown
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

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const attachmentValidationError = validateIncomingAttachments(messages)
    if (attachmentValidationError) {
      return attachmentValidationError
    }

    const conversation = conversationId ? getConversation(conversationId) : undefined
    const userMessages = messages.filter(m => m.role === "user")
    const lastUserMessage = userMessages[userMessages.length - 1]
    const lastUserText = lastUserMessage ? getMessageText(lastUserMessage) : ""
    const firstUserText = userMessages[0] ? getMessageText(userMessages[0]) : ""
    const isFirstAssistantTurn = userMessages.length > 0 && messages.every(m => m.role !== "assistant")
    const modelMessages = normalizeMessagePartsForModel(messages)
    const chatConfig = loadChatRouteConfig(provider)
    const ragProviderConfig = loadRagProviderConfig(chatConfig.ragModel, provider, chatConfig.providerConfig)
    const thinkingLevel = normalizeThinkingLevel(rawThinkingLevel)

    // Build system prompt: custom setting > conversation-level > default
    let systemPrompt = chatConfig.customSystemPrompt || "You are a helpful AI assistant."
    if (conversation?.systemPrompt) {
      systemPrompt = conversation.systemPrompt
    }

    // Inject user name if configured
    const userName = chatConfig.userName
    if (userName) {
      systemPrompt = systemPrompt + `\n\nThe user's name is ${userName}.`
    }

    // Inject memories into system prompt
    const memoryEnabled = chatConfig.memoryEnabled
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
      const ragModel = chatConfig.ragModel
      if (ragModel?.provider && ragModel?.model) {
        try {
          if (lastUserText) {
            const results = await searchDocuments(conversation.projectId, lastUserText, 5, {
              embeddingConfig: {
                provider: ragModel.provider,
                model: ragModel.model,
                providerConfig: ragProviderConfig,
              },
            })
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
    const tavilyKey = chatConfig.tavilyKey
    if (tavilyKey) {
      systemPrompt = systemPrompt + "\n\nWhen web-search evidence is available, respond with a concise summary in bullet points followed by a References section that uses numbered citations like [1], [2]. Paraphrase findings and avoid copying snippets verbatim."
    }

    // Always-search mode: pre-fetch results into system prompt
    if (webSearch && tavilyKey && lastUserText) {
      try {
        const results = await searchWeb(lastUserText.slice(0, 200), undefined, { apiKey: tavilyKey })
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

    const llmModel = getModel(provider, modelId, { config: chatConfig.providerConfig })
    const thinkingConfig = buildThinkingRequestConfig(provider, modelId, thinkingLevel, maxOutputTokens)

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
                const results = await searchWeb(query, undefined, { apiKey: tavilyKey })
                return formatSearchToolSummary(results)
              } catch (err) {
                return `Search failed: ${err instanceof Error ? err.message : "Unknown error"}`
              }
            },
          }),
        },
        maxSteps: 3,
      } : {}),
      // Reasoning/thinking models often reject normal sampling params.
      ...(thinkingConfig.omitSampling
        ? { maxOutputTokens: thinkingConfig.maxOutputTokens ?? maxOutputTokens ?? THINKING_MAX_OUTPUT_TOKENS }
        : {
          temperature: temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          topP: topP ?? 1,
        }),
      ...(thinkingConfig.providerOptions ? { providerOptions: thinkingConfig.providerOptions } : {}),
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
        ...(process.env.NODE_ENV === "development" && error instanceof Error ? { stack: error.stack } : {}),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
