"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage, FileUIPart } from "ai"
import { MessageList } from "./message-list"
import { ChatInput } from "./chat-input"
import type { ChatInputSendPayload } from "./chat-input"
import { ModelSelector } from "./model-selector"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"
import type { BubbleStyle } from "@/hooks/use-chat-theme"
import {
  isTextDocument,
  resolveAttachmentMediaType,
  validateChatAttachments,
} from "@/lib/chat-attachments"
import { DEFAULT_THINKING_LEVEL, THINKING_LEVEL_LABELS, type ThinkingLevel } from "@/lib/thinking"

type ProjectInitMessage = {
  projectId: string
  text: string
}

type ChatPanelProps = {
  conversationId: string | null
  onConversationCreated?: (id: string) => void
  projectId?: string | null
  projectInitMessage?: ProjectInitMessage | null
  onProjectInitConsumed?: () => void
}

type DefaultModel = {
  provider: string
  model: string
}

type ProviderConfigSummary = Record<string, { hasKey: boolean; baseUrl?: string }>
type ConversationLoadAction = "clear" | "skip" | "load"

const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_TOP_P = 1

export function getConversationLoadAction(
  previousConversationId: string | null | undefined,
  nextConversationId: string | null
): ConversationLoadAction {
  if (!nextConversationId) {
    return previousConversationId !== nextConversationId ? "clear" : "skip"
  }

  if (previousConversationId === nextConversationId) {
    return "skip"
  }

  return "load"
}

export function shouldReloadCurrentConversation(
  action: ConversationLoadAction,
  conversationId: string | null,
  currentMessageCount: number
): boolean {
  return action === "skip" && !!conversationId && currentMessageCount === 0
}

export function resolveInitialModelSelection(
  defaults: DefaultModel | undefined,
  providerConfigs: ProviderConfigSummary | null
): DefaultModel {
  const fallback: DefaultModel = {
    provider: "openai",
    model: "gpt-4o",
  }

  const candidate = (defaults?.provider && defaults?.model)
    ? defaults
    : fallback

  if (!providerConfigs) return candidate

  if (providerConfigs[candidate.provider]?.hasKey) {
    return candidate
  }

  const firstConfiguredProvider = PROVIDER_REGISTRY.find(p => providerConfigs[p.id]?.hasKey)
  if (!firstConfiguredProvider) {
    return candidate
  }

  const fallbackModel = firstConfiguredProvider.defaultModels[0] ?? candidate.model
  return {
    provider: firstConfiguredProvider.id,
    model: fallbackModel,
  }
}

function parseStoredParts(content: string, metadata: string | null | undefined): UIMessage["parts"] {
  if (!metadata) {
    return [{ type: "text" as const, text: content }]
  }

  try {
    const parsed = JSON.parse(metadata) as { parts?: unknown }
    if (Array.isArray(parsed.parts)) {
      const validParts = parsed.parts.filter((part): part is UIMessage["parts"][number] => {
        return typeof part === "object" && part !== null && typeof (part as { type?: unknown }).type === "string"
      })
      if (validParts.length > 0) {
        return validParts
      }
    }
  } catch {
    // Fall back to text-only parts when metadata is malformed.
  }

  return [{ type: "text" as const, text: content }]
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") {
        resolve(result)
        return
      }
      reject(new Error(`Unexpected file read result type for ${file.name}`))
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read file: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

function resolveChatError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

async function buildFileParts(files: File[]): Promise<FileUIPart[]> {
  const parts = await Promise.all(files.map(async (file): Promise<FileUIPart> => {
    const mediaType = resolveAttachmentMediaType(file)
    const url = await readFileAsDataUrl(file)
    return {
      type: "file",
      mediaType,
      filename: file.name,
      url,
    }
  }))
  return parts
}

function messageHasAttachments(message: UIMessage | undefined): boolean {
  return Boolean(message?.parts?.some(part => part.type === "file"))
}

function getAssistantActivityLabel(status: string, messages: UIMessage[], webSearch: boolean): string {
  const latestMessage = messages[messages.length - 1]
  const latestUserHasAttachments = latestMessage?.role === "user" && messageHasAttachments(latestMessage)

  if (status === "submitted" && latestUserHasAttachments) {
    return "Reading attachments..."
  }
  if (status === "submitted" && webSearch) {
    return "Preparing web search..."
  }
  if (status === "submitted") {
    return "Contacting provider..."
  }
  if (status === "streaming") {
    return "Writing response..."
  }
  return "Generating response..."
}

export function ChatPanel({ conversationId, onConversationCreated, projectId, projectInitMessage, onProjectInitConsumed }: ChatPanelProps) {
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>("flat")
  const [webSearch, setWebSearch] = useState(false)
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(DEFAULT_THINKING_LEVEL)
  const [searchAvailable, setSearchAvailable] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const convIdRef = useRef(conversationId)
  convIdRef.current = conversationId

  // Use refs so the transport body always reads latest values
  const stateRef = useRef({
    provider,
    model,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    topP: DEFAULT_TOP_P,
    webSearch,
    thinkingLevel,
  })
  useEffect(() => {
    stateRef.current = {
      provider,
      model,
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      topP: DEFAULT_TOP_P,
      webSearch,
      thinkingLevel,
    }
  }, [provider, model, webSearch, thinkingLevel])

  // Load default provider/model from settings
  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      fetch("/api/settings?keys=default-model,search:tavilyKey", { cache: "no-store", signal: controller.signal })
        .then(res => res.ok ? res.json() : {}),
      fetch("/api/providers/configs", { cache: "no-store", signal: controller.signal })
        .then(res => res.ok ? res.json() : null),
    ])
      .then(([settings, providerConfigs]) => {
        const defaults = (settings as Record<string, unknown>)["default-model"] as DefaultModel | undefined
        const resolved = resolveInitialModelSelection(defaults, providerConfigs as ProviderConfigSummary | null)
        setProvider(resolved.provider)
        setModel(resolved.model)
        const hasTavilyKey = !!(settings as Record<string, unknown>)["search:tavilyKey"]
        setSearchAvailable(hasTavilyKey)
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        setProvider("openai")
        setModel("gpt-4o")
      })
      .finally(() => setDefaultsLoaded(true))

    return () => controller.abort()
  }, [])

  // Sync bubbleStyle from DOM attribute (set by useChatTheme hook / ThemeInitializer)
  useEffect(() => {
    const readStyle = () => {
      const style = document.documentElement.dataset.bubbleStyle as BubbleStyle | undefined
      if (style) setBubbleStyle(style)
    }
    readStyle()
    const observer = new MutationObserver(readStyle)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bubble-style"] })
    return () => observer.disconnect()
  }, [])

  // Persist provider/model selection as default
  const saveDefaultRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!defaultsLoaded || !provider || !model) return
    clearTimeout(saveDefaultRef.current)
    saveDefaultRef.current = setTimeout(() => {
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "default-model", value: { provider, model } }),
      }).catch(() => { })
    }, 500)

    return () => clearTimeout(saveDefaultRef.current)
  }, [provider, model, defaultsLoaded])

  // Memoize transport so useChat doesn't lose state across renders
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    body: () => ({
      conversationId: convIdRef.current,
      ...stateRef.current,
    }),
  }), [])

  const { messages, sendMessage, regenerate, setMessages, status } = useChat({
    transport,
    onError: (error) => {
      console.error("[useChat] Error:", error)
      setChatError(resolveChatError(error, "The assistant failed to respond. Your message was saved; retry when the provider is available."))
    },
  })

  // Load messages when conversation changes (including switching between conversations)
  const prevConvIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const previousConversationId = prevConvIdRef.current
    const action = getConversationLoadAction(previousConversationId, conversationId)
    const shouldReloadCurrent = shouldReloadCurrentConversation(action, conversationId, messages.length)

    if (action === "clear") {
      if (previousConversationId !== conversationId) {
        setMessages([])
      }
      prevConvIdRef.current = conversationId
      setLoaded(true)
      return
    }

    if (action === "skip" && !shouldReloadCurrent) {
      prevConvIdRef.current = conversationId
      setLoaded(true)
      return
    }

    // First mount with an existing conversation, switch between conversations,
    // or rehydrate if the current conversation unexpectedly lost local messages.
    prevConvIdRef.current = conversationId
    setLoaded(false)
    const controller = new AbortController()
    fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store", signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Failed to load messages")))
      .then((dbMessages: Array<{ id: string; role: string; content: string; metadata?: string | null }>) => {
        const uiMessages: UIMessage[] = dbMessages.map(m => ({
          id: m.id,
          role: m.role as UIMessage["role"],
          content: m.content,
          parts: parseStoredParts(m.content, m.metadata),
        }))
        setMessages(uiMessages)
        setLoaded(true)
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        console.error("[chat-panel] Failed to load conversation messages:", error)
        setChatError("Could not load this conversation. Try switching away and back again.")
        if (action === "load") {
          // We intentionally avoid clearing on same-conversation rehydrate failures
          // to prevent transient fetch errors from wiping visible history.
          setMessages([])
        }
        setLoaded(true)
      })
    return () => controller.abort()
  }, [conversationId, messages.length, setMessages])

  const isLoading = status === "streaming" || status === "submitted"
  const assistantActivityLabel = getAssistantActivityLabel(status, messages, webSearch)
  const activeProviderName = PROVIDER_REGISTRY.find(p => p.id === provider)?.name ?? provider

  // Keep a ref for projectId so handleSend always reads the latest
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const handleSend = useCallback(async ({ text, files }: ChatInputSendPayload) => {
    try {
      setChatError(null)
      const trimmedText = text.trim()
      if (!trimmedText && files.length === 0) {
        return
      }

      const validation = validateChatAttachments(files)
      if (!validation.valid) {
        throw new Error(validation.error ?? "One or more attachments are not supported.")
      }

      let activeConvId = convIdRef.current

      // Auto-create conversation on first message
      if (!activeConvId) {
        const fallbackTitle = files[0]?.name ? `File: ${files[0].name}` : "New Chat"
        const createBody: Record<string, unknown> = {
          model: stateRef.current.model,
          provider: stateRef.current.provider,
          title: (trimmedText || fallbackTitle).slice(0, 50),
        }
        // Attach projectId if creating within a project context
        if (projectIdRef.current) {
          createBody.projectId = projectIdRef.current
        }
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        })
        if (!res.ok) throw new Error("Failed to create conversation")
        const conv = await res.json()
        activeConvId = conv.id
        convIdRef.current = activeConvId
        // Update prevConvIdRef so the effect doesn't reload messages
        prevConvIdRef.current = activeConvId
        onConversationCreated?.(conv.id)
      }

      const fileParts = files.length > 0 ? await buildFileParts(files) : []
      const persistedTextFileParts = fileParts.filter(part => isTextDocument(part.mediaType, part.filename))
      const persistedParts: UIMessage["parts"] = [
        ...(trimmedText ? [{ type: "text" as const, text: trimmedText }] : []),
        ...persistedTextFileParts,
      ]
      const metadata = persistedTextFileParts.length > 0
        ? JSON.stringify({ parts: persistedParts })
        : undefined
      const persistedContent = text || (
        files.length > 0 && !metadata
          ? `[Uploaded ${files.length} attachment${files.length > 1 ? "s" : ""}: ${files.map(file => file.name).join(", ")}]`
          : ""
      )

      // Persist user message to DB
      const persistRes = await fetch(`/api/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: persistedContent,
          ...(metadata ? { metadata } : {}),
        }),
      })
      if (!persistRes.ok) throw new Error("Failed to persist message")

      if (trimmedText && fileParts.length > 0) {
        await sendMessage({ text: trimmedText, files: fileParts })
      } else if (trimmedText) {
        await sendMessage({ text: trimmedText })
      } else if (fileParts.length > 0) {
        await sendMessage({ files: fileParts })
      }
    } catch (error) {
      console.error("[handleSend] Error:", error)
      const message = resolveChatError(error, "Failed to send. Your draft was kept.")
      setChatError(message)
      throw new Error(message)
    }
  }, [sendMessage, onConversationCreated])

  const handleRetry = useCallback(() => {
    if (isLoading) {
      return
    }
    setChatError(null)
    regenerate().catch((error) => {
      console.error("[handleRetry] Error:", error)
      setChatError(resolveChatError(error, "Failed to retry the latest response."))
    })
  }, [regenerate, isLoading])

  // Handle project init message (when user starts a conversation from ProjectHome)
  const projectInitHandled = useRef(false)
  useEffect(() => {
    if (projectInitMessage && !projectInitHandled.current && defaultsLoaded) {
      projectInitHandled.current = true
      handleSend({ text: projectInitMessage.text, files: [] })
      onProjectInitConsumed?.()
    }
    if (!projectInitMessage) {
      projectInitHandled.current = false
    }
  }, [projectInitMessage, defaultsLoaded, handleSend, onProjectInitConsumed])

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    const providerDef = PROVIDER_REGISTRY.find(p => p.id === newProvider)
    if (providerDef?.defaultModels[0]) {
      setModel(providerDef.defaultModels[0])
    } else {
      setModel("")
    }
  }

  if (!loaded || !defaultsLoaded) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <span className="text-muted-foreground animate-pulse">Loading...</span>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden safe-area-top">
      <div className="sticky top-0 z-20 shrink-0 bg-gradient-to-b from-background via-background/95 to-transparent px-2 pb-3 pt-2 backdrop-blur-sm sm:px-4">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2">
          <SidebarTrigger className="h-9 w-9 shrink-0 rounded-full border border-border/40 bg-background/65 shadow-sm backdrop-blur" />
          <div className="min-w-0 flex-1 rounded-[1.35rem] border border-border/45 bg-background/75 px-2 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <ModelSelector
                  provider={provider}
                  model={model}
                  onProviderChange={handleProviderChange}
                  onModelChange={setModel}
                />
              </div>
              <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/45 bg-black/[0.12] px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span className={isLoading ? "h-1.5 w-1.5 animate-pulse rounded-full bg-primary" : "h-1.5 w-1.5 rounded-full bg-primary/70"} />
                  {isLoading ? "Working" : "Ready"}
                </span>
                {activeProviderName ? (
                  <span className="inline-flex max-w-32 items-center rounded-full border border-border/45 bg-black/[0.12] px-2.5 py-1 text-[11px] text-muted-foreground">
                    <span className="truncate">{activeProviderName}</span>
                  </span>
                ) : null}
                {webSearch ? (
                  <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                    Search on
                  </span>
                ) : null}
                {thinkingLevel !== "off" ? (
                  <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                    Think {THINKING_LEVEL_LABELS[thinkingLevel]}
                  </span>
                ) : null}
                {projectId ? (
                  <span className="inline-flex items-center rounded-full border border-border/45 bg-black/[0.12] px-2.5 py-1 text-[11px] text-muted-foreground">
                    Project
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      <MessageList
        messages={messages}
        isLoading={isLoading}
        activityLabel={assistantActivityLabel}
        bubbleStyle={bubbleStyle}
        onRetry={handleRetry}
      />
      {chatError ? (
        <div className="mx-auto mb-2 w-full max-w-4xl px-2 sm:px-4">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive/95 shadow-sm backdrop-blur">
            <span className="leading-5">{chatError}</span>
            <button
              type="button"
              className="shrink-0 text-destructive/70 transition-colors hover:text-destructive"
              onClick={() => setChatError(null)}
              aria-label="Dismiss chat error"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        webSearch={webSearch}
        onWebSearchChange={setWebSearch}
        searchAvailable={searchAvailable}
        thinkingLevel={thinkingLevel}
        onThinkingLevelChange={setThinkingLevel}
      />
    </div>
  )
}

