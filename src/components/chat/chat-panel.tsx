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

type ChatPanelProps = {
  conversationId: string | null
  onConversationCreated?: (id: string) => void
}

type DefaultModel = {
  provider: string
  model: string
}

export function ChatPanel({ conversationId, onConversationCreated }: ChatPanelProps) {
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [topP, setTopP] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>("flat")

  const convIdRef = useRef(conversationId)
  convIdRef.current = conversationId

  // Use refs so the transport body always reads latest values
  const stateRef = useRef({ provider, model, temperature, maxTokens, topP })
  useEffect(() => {
    stateRef.current = { provider, model, temperature, maxTokens, topP }
  }, [provider, model, temperature, maxTokens, topP])

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
        const chatTheme = settings["ui:chatTheme"] as { bubbleStyle?: string } | undefined
        if (chatTheme?.bubbleStyle) {
          setBubbleStyle(chatTheme.bubbleStyle as BubbleStyle)
        }
      })
      .catch(() => {
        setProvider("openai")
        setModel("gpt-4o")
      })
      .finally(() => setDefaultsLoaded(true))
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

  const handleSend = useCallback(async (text: string) => {
    let activeConvId = convIdRef.current

    // Auto-create conversation on first message
    if (!activeConvId) {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: stateRef.current.model,
          provider: stateRef.current.provider,
          title: text.slice(0, 50),
        }),
      })
      const conv = await res.json()
      activeConvId = conv.id
      convIdRef.current = activeConvId
      // Update prevConvIdRef so the effect doesn't reload messages
      prevConvIdRef.current = activeConvId
      onConversationCreated?.(conv.id)
    }

    // Persist user message to DB
    await fetch(`/api/conversations/${activeConvId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: text }),
    })

    sendMessage({ text })
  }, [sendMessage, onConversationCreated])

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
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 flex items-center gap-2 safe-area-top">
        <SidebarTrigger className="h-8 w-8" />
        <ModelSelector
          provider={provider}
          model={model}
          onProviderChange={handleProviderChange}
          onModelChange={setModel}
        />
      </div>
      <MessageList messages={messages} isLoading={isLoading} bubbleStyle={bubbleStyle} />
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  )
}
