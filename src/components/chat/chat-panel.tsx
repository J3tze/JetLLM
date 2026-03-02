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
const TEXT_MEDIA_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/sql",
  "application/x-sh",
  "application/x-httpd-php",
  "application/x-yaml",
  "application/yaml",
])

const TEXT_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "yaml",
  "yml",
  "log",
  "html",
  "htm",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "rs",
  "go",
  "sql",
  "sh",
  "ps1",
])

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",
  log: "text/plain",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  jsx: "text/plain",
  py: "text/plain",
  java: "text/plain",
  c: "text/plain",
  cpp: "text/plain",
  h: "text/plain",
  hpp: "text/plain",
  rs: "text/plain",
  go: "text/plain",
  sql: "application/sql",
  sh: "application/x-sh",
  ps1: "text/plain",
}

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

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".")
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : ""
}

function inferMediaType(file: File): string {
  if (file.type) return file.type
  const extension = getFileExtension(file.name)
  return EXTENSION_MEDIA_TYPES[extension] ?? "application/octet-stream"
}

function isTextDocument(mediaType: string, filename?: string): boolean {
  if (mediaType.startsWith("text/")) {
    return true
  }
  if (TEXT_MEDIA_TYPES.has(mediaType)) {
    return true
  }
  if (!filename) {
    return false
  }
  return TEXT_FILE_EXTENSIONS.has(getFileExtension(filename))
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

async function buildFileParts(files: File[]): Promise<FileUIPart[]> {
  const parts = await Promise.all(files.map(async (file): Promise<FileUIPart> => {
    const mediaType = inferMediaType(file)
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

  const handleSend = useCallback(async ({ text, files }: ChatInputSendPayload) => {
    try {
      const trimmedText = text.trim()
      if (!trimmedText && files.length === 0) {
        return
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
      <div className="sticky top-0 z-20 shrink-0 px-4 pt-2 pb-3 flex items-center gap-2 bg-gradient-to-b from-background via-background/95 to-transparent backdrop-blur-sm">
        <SidebarTrigger className="h-8 w-8 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-center">
          <ModelSelector
            provider={provider}
            model={model}
            onProviderChange={handleProviderChange}
            onModelChange={setModel}
          />
        </div>
        <div className="h-8 w-8 shrink-0 sm:hidden" aria-hidden />
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

