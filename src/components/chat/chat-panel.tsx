"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
import { MessageList } from "./message-list"
import { ChatInput } from "./chat-input"
import { ModelSelector } from "./model-selector"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"
import type { BubbleStyle } from "@/hooks/use-chat-theme"

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

export function ChatPanel({ conversationId, onConversationCreated, projectId, projectInitMessage, onProjectInitConsumed }: ChatPanelProps) {
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>("flat")
  const [webSearch, setWebSearch] = useState(false)
  const [searchAvailable, setSearchAvailable] = useState(false)

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
  })
  useEffect(() => {
    stateRef.current = {
      provider,
      model,
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      topP: DEFAULT_TOP_P,
      webSearch,
    }
  }, [provider, model, webSearch])

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

  // Keep a ref for projectId so handleSend always reads the latest
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const handleSend = useCallback(async (text: string) => {
    try {
      let activeConvId = convIdRef.current

      // Auto-create conversation on first message
      if (!activeConvId) {
        const createBody: Record<string, unknown> = {
          model: stateRef.current.model,
          provider: stateRef.current.provider,
          title: text.slice(0, 50),
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

      // Persist user message to DB
      const persistRes = await fetch(`/api/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: text }),
      })
      if (!persistRes.ok) throw new Error("Failed to persist message")

      await sendMessage({ text })
    } catch (error) {
      console.error("[handleSend] Error:", error)
    }
  }, [sendMessage, onConversationCreated])

  const handleRetry = useCallback(() => {
    if (isLoading) {
      return
    }
    regenerate().catch((error) => {
      console.error("[handleRetry] Error:", error)
    })
  }, [regenerate, isLoading])

  // Handle project init message (when user starts a conversation from ProjectHome)
  const projectInitHandled = useRef(false)
  useEffect(() => {
    if (projectInitMessage && !projectInitHandled.current && defaultsLoaded) {
      projectInitHandled.current = true
      handleSend(projectInitMessage.text)
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
    <div className="flex flex-col h-full safe-area-top">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <SidebarTrigger className="h-8 w-8" />
        <ModelSelector
          provider={provider}
          model={model}
          onProviderChange={handleProviderChange}
          onModelChange={setModel}
        />
      </div>
      <MessageList
        messages={messages}
        isLoading={isLoading}
        bubbleStyle={bubbleStyle}
        onRetry={handleRetry}
      />
      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        webSearch={webSearch}
        onWebSearchChange={setWebSearch}
        searchAvailable={searchAvailable}
      />
    </div>
  )
}

