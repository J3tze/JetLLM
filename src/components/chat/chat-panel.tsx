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

export function ChatPanel({ conversationId, onConversationCreated, projectId, projectInitMessage, onProjectInitConsumed }: ChatPanelProps) {
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [topP, setTopP] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>("flat")
  const [webSearch, setWebSearch] = useState(false)
  const [searchAvailable, setSearchAvailable] = useState(false)

  const convIdRef = useRef(conversationId)
  convIdRef.current = conversationId

  // Use refs so the transport body always reads latest values
  const stateRef = useRef({ provider, model, temperature, maxTokens, topP, webSearch })
  useEffect(() => {
    stateRef.current = { provider, model, temperature, maxTokens, topP, webSearch }
  }, [provider, model, temperature, maxTokens, topP, webSearch])

  // Load default provider/model from settings
  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.ok ? res.json() : {})
      .then((settings: Record<string, unknown>) => {
        const defaults = settings["default-model"] as DefaultModel | undefined
        if (defaults?.provider && defaults?.model) {
          setProvider(defaults.provider)
          setModel(defaults.model)
        } else {
          setProvider("openai")
          setModel("gpt-4o")
        }
        const hasTavilyKey = !!settings["search:tavilyKey"]
        setSearchAvailable(hasTavilyKey)
      })
      .catch(() => {
        setProvider("openai")
        setModel("gpt-4o")
      })
      .finally(() => setDefaultsLoaded(true))
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
      }).catch(() => {})
    }, 500)
  }, [provider, model, defaultsLoaded])

  // Memoize transport so useChat doesn't lose state across renders
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    body: () => ({
      conversationId: convIdRef.current,
      ...stateRef.current,
    }),
  }), [])

  const { messages, sendMessage, setMessages, status } = useChat({
    transport,
    onError: (error) => {
      console.error("[useChat] Error:", error)
    },
  })

  // Load messages when conversation changes (including switching between conversations)
  const prevConvIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    // Skip on initial render before we know the conversation ID
    if (prevConvIdRef.current === undefined) {
      prevConvIdRef.current = conversationId
    }

    if (!conversationId) {
      // New chat — clear messages
      if (prevConvIdRef.current !== conversationId) {
        setMessages([])
      }
      prevConvIdRef.current = conversationId
      setLoaded(true)
      return
    }

    // Same conversation (e.g. after creation) — don't reload
    if (prevConvIdRef.current === conversationId) {
      setLoaded(true)
      return
    }

    // Switching to a different existing conversation — load from DB
    prevConvIdRef.current = conversationId
    setLoaded(false)
    fetch(`/api/conversations/${conversationId}/messages`)
      .then(res => res.json())
      .then((dbMessages: Array<{ id: string; role: string; content: string }>) => {
        const uiMessages: UIMessage[] = dbMessages.map(m => ({
          id: m.id,
          role: m.role as UIMessage["role"],
          content: m.content,
          parts: [{ type: "text" as const, text: m.content }],
        }))
        setMessages(uiMessages)
        setLoaded(true)
      })
      .catch(() => {
        setMessages([])
        setLoaded(true)
      })
  }, [conversationId, setMessages])

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

      sendMessage({ text })
    } catch (error) {
      console.error("[handleSend] Error:", error)
    }
  }, [sendMessage, onConversationCreated])

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
      <MessageList messages={messages} isLoading={isLoading} bubbleStyle={bubbleStyle} />
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
