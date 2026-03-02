"use client"

import Image from "next/image"
import { useState, useEffect, useRef, useCallback, useMemo, useId, type ReactNode } from "react"
import { ChatMessage } from "./chat-message"
import { ChevronDown, Globe, RotateCw, FileText } from "lucide-react"
import { JetLLMLogo } from "@/components/jetllm-logo"
import { CodeBlock } from "./code-block"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UIMessage } from "ai"
import type { BubbleStyle } from "@/hooks/use-chat-theme"

function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
        Thinking
      </button>
      {open && (
        <div className="mt-1 pl-4 border-l-2 border-border text-xs text-muted-foreground whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}

const GREETINGS = [
  "What will it be today?",
  "Ready when you are.",
  "Ask me anything.",
  "Let's build something cool.",
  "What's on your mind?",
  "Curiosity is a superpower.",
  "Let's figure this out together.",
  "Your wish is my command.",
  "Hit me with your best question.",
  "The floor is yours.",
  "What shall we explore?",
  "Fire away.",
  "Another day, another prompt.",
  "I'm all ears. Well, all tokens.",
]

function getViewport(ref: React.RefObject<HTMLDivElement | null>) {
  return ref.current
}

function isNearBottom(viewport: HTMLElement, threshold = 80) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < threshold
}

function getToolQuery(input: unknown): string {
  if (!input || typeof input !== "object") return ""
  const query = (input as Record<string, unknown>).query
  return typeof query === "string" ? query : ""
}

function getToolOutputText(output: unknown): string {
  if (typeof output === "string") return output
  if (output == null) return ""
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

function normalizeToolOutputText(text: string): string {
  return text
    .replace(/^###\s+/gm, "")
    .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .trim()
}

type ParsedReference = {
  id: string
  title: string
  url: string
}

type ParsedSearchOutput = {
  updates: string[]
  references: ParsedReference[]
  remaining: string[]
}

type WebSearchResultContentProps = {
  outputText: string
  parsedOutput: ParsedSearchOutput
}

function parseSearchToolOutput(text: string): ParsedSearchOutput {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const parsed: ParsedSearchOutput = { updates: [], references: [], remaining: [] }

  let section: "updates" | "references" | "other" = "other"
  for (const line of lines) {
    if (/^key updates:/i.test(line)) {
      section = "updates"
      continue
    }
    if (/^references:/i.test(line)) {
      section = "references"
      continue
    }

    if (section === "updates" && line.startsWith("- ")) {
      parsed.updates.push(line.slice(2).trim())
      continue
    }

    if (section === "references") {
      const urlMatch = line.match(/https?:\/\/\S+/)
      if (urlMatch) {
        const rawUrl = urlMatch[0]
        const url = rawUrl.replace(/[),.;]+$/, "")
        const idMatch = line.match(/^\[(\d+)\]/)
        const id = idMatch?.[1] ?? String(parsed.references.length + 1)
        const withoutId = line.replace(/^\[\d+\]\s*/, "")
        const title = withoutId.replace(rawUrl, "").replace(/\s*-\s*$/, "").trim() || url
        parsed.references.push({ id, title, url })
        continue
      }
    }

    parsed.remaining.push(line)
  }

  return parsed
}

function renderFilePart(part: { mediaType: string; url: string; filename?: string }, key: number) {
  const isImage = part.mediaType.startsWith("image/")
  const label = part.filename || (isImage ? "Attached image" : "Attached file")

  if (isImage) {
    return (
      <div key={key} className="mb-1 overflow-hidden rounded-lg border border-border/40 bg-black/20">
        <Image
          src={part.url}
          alt={label}
          width={960}
          height={720}
          unoptimized
          className="max-h-80 w-full bg-black/30 object-contain"
          loading="lazy"
        />
        <div className="truncate px-2 py-1 text-[11px] text-muted-foreground">{label}</div>
      </div>
    )
  }

  return (
    <a
      key={key}
      href={part.url}
      download={part.filename || "attachment"}
      className="mb-1 inline-flex max-w-full items-center gap-2 rounded-md border border-border/50 bg-black/20 px-2.5 py-1.5 text-xs text-foreground/90 hover:border-primary/40 hover:text-foreground"
    >
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="max-w-[240px] truncate">{label}</span>
    </a>
  )
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[1]) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${index}`}
          className="rounded bg-black/35 px-1 py-0.5 text-[0.85em]"
        >
          {match[1]}
        </code>
      )
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`${keyPrefix}-link-${index}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-current underline break-all"
        >
          {match[2]}
        </a>
      )
    }

    lastIndex = pattern.lastIndex
    index += 1
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function renderTextWithBreaks(text: string, keyPrefix: string): ReactNode[] {
  return text.split("\n").map((line, index, arr) => (
    <span key={`${keyPrefix}-line-${index}`}>
      {renderInlineMarkdown(line, `${keyPrefix}-inline-${index}`)}
      {index < arr.length - 1 ? <br /> : null}
    </span>
  ))
}

function renderMarkdownContent(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.split(/\r?\n/)
  const nodes: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    const codeFence = line.match(/^```(\w+)?\s*$/)
    if (codeFence) {
      const language = codeFence[1] || "text"
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && /^```/.test(lines[i])) {
        i += 1
      }
      nodes.push(
        <CodeBlock
          key={`${keyPrefix}-codeblock-${nodes.length}`}
          language={language}
          code={codeLines.join("\n")}
        />
      )
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const content = heading[2]
      if (level === 1) {
        nodes.push(
          <h1 key={`${keyPrefix}-h1-${nodes.length}`} className="my-1 text-base font-semibold">
            {renderInlineMarkdown(content, `${keyPrefix}-h1-inline-${nodes.length}`)}
          </h1>
        )
      } else if (level === 2) {
        nodes.push(
          <h2 key={`${keyPrefix}-h2-${nodes.length}`} className="my-1 text-base font-semibold">
            {renderInlineMarkdown(content, `${keyPrefix}-h2-inline-${nodes.length}`)}
          </h2>
        )
      } else {
        nodes.push(
          <h3 key={`${keyPrefix}-h3-${nodes.length}`} className="my-1 text-sm font-semibold">
            {renderInlineMarkdown(content, `${keyPrefix}-h3-inline-${nodes.length}`)}
          </h3>
        )
      }
      i += 1
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""))
        i += 1
      }
      nodes.push(
        <ul key={`${keyPrefix}-ul-${nodes.length}`} className="my-1 list-disc pl-5">
          {items.map((item, idx) => (
            <li key={`${keyPrefix}-ul-item-${idx}`} className="my-0.5">
              {renderInlineMarkdown(item, `${keyPrefix}-ul-inline-${idx}`)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""))
        i += 1
      }
      nodes.push(
        <ol key={`${keyPrefix}-ol-${nodes.length}`} className="my-1 list-decimal pl-5">
          {items.map((item, idx) => (
            <li key={`${keyPrefix}-ol-item-${idx}`} className="my-0.5">
              {renderInlineMarkdown(item, `${keyPrefix}-ol-inline-${idx}`)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    const paragraphLines: string[] = []
    while (
      i < lines.length
      && lines[i].trim()
      && !/^```/.test(lines[i])
      && !/^(#{1,3})\s+/.test(lines[i])
      && !/^[-*]\s+/.test(lines[i])
      && !/^\d+\.\s+/.test(lines[i])
    ) {
      paragraphLines.push(lines[i])
      i += 1
    }
    nodes.push(
      <p key={`${keyPrefix}-p-${nodes.length}`} className="my-1">
        {renderTextWithBreaks(paragraphLines.join("\n"), `${keyPrefix}-p-inline-${nodes.length}`)}
      </p>
    )
  }

  return nodes
}

function WebSearchResultContent({ outputText, parsedOutput }: WebSearchResultContentProps) {
  const [expanded, setExpanded] = useState(false)

  const needsToggle =
    parsedOutput.updates.length > 3
    || parsedOutput.references.length > 4
    || parsedOutput.remaining.length > 1
    || outputText.length > 700

  const updates = expanded ? parsedOutput.updates : parsedOutput.updates.slice(0, 3)
  const references = expanded ? parsedOutput.references : parsedOutput.references.slice(0, 4)
  const remaining = expanded ? parsedOutput.remaining : parsedOutput.remaining.slice(0, 1)

  const hiddenUpdates = Math.max(0, parsedOutput.updates.length - updates.length)
  const hiddenReferences = Math.max(0, parsedOutput.references.length - references.length)
  const hiddenRemaining = Math.max(0, parsedOutput.remaining.length - remaining.length)
  const hiddenCount = hiddenUpdates + hiddenReferences + hiddenRemaining

  return (
    <div className="rounded-md bg-black/20 px-3 py-2 text-[13px] leading-5 text-foreground/90 space-y-2">
      {updates.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/90">Key Updates</p>
          <ul className="space-y-1">
            {updates.map((update, idx) => {
              const cited = update.match(/^\[(\d+)\]\s*(.*)$/)
              const citation = cited?.[1]
              const summary = cited?.[2] ?? update
              return (
                <li key={`u-${idx}`} className="flex gap-1.5 text-[13px] leading-5">
                  {citation ? (
                    <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary/15 px-1 text-[11px] font-semibold text-primary">
                      [{citation}]
                    </span>
                  ) : (
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                  )}
                  <span>{summary}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {references.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/90">References</p>
          <ul className="space-y-1">
            {references.map((ref) => (
              <li key={`r-${ref.id}`} className="text-[13px] leading-5">
                <span className="mr-1 text-primary/90 font-semibold">[{ref.id}]</span>
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#4f6fa8] underline decoration-[#5f7db3]/70 underline-offset-2 break-all hover:text-[#6f8fc6]"
                >
                  {ref.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {updates.length === 0 && references.length === 0 ? (
        <div className="whitespace-pre-wrap break-words">{outputText}</div>
      ) : null}

      {remaining.length > 0 ? (
        <div className="whitespace-pre-wrap break-words text-foreground/80">
          {remaining.join("\n")}
        </div>
      ) : null}

      {needsToggle ? (
        <div className="pt-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] text-primary hover:text-primary/80"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? "Show less" : `Show more${hiddenCount > 0 ? ` (${hiddenCount})` : ""}`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function renderWebSearchIndicator(part: unknown, key: number) {
  if (!part || typeof part !== "object") return null

  const legacyPart = part as {
    type?: string
    toolInvocation?: { toolName?: string; state?: string; args?: Record<string, unknown> }
  }
  if (legacyPart.type === "tool-invocation" && legacyPart.toolInvocation?.toolName === "web_search") {
    const query = typeof legacyPart.toolInvocation.args?.query === "string"
      ? legacyPart.toolInvocation.args.query
      : ""
    const isDone = legacyPart.toolInvocation.state === "result"
    return (
      <div key={key} className="mb-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" />
          {isDone ? `Searched the web${query ? ` for "${query}"` : ""}` : "Searching the web..."}
        </div>
      </div>
    )
  }

  const toolPart = part as {
    type?: string
    state?: string
    input?: unknown
    output?: unknown
    errorText?: string
  }
  if (!toolPart.type?.startsWith("tool-")) return null
  const toolName = toolPart.type.slice("tool-".length)
  if (toolName !== "web_search") return null

  const state = toolPart.state ?? "input-streaming"
  const query = getToolQuery(toolPart.input)
  const outputText = normalizeToolOutputText(getToolOutputText(toolPart.output))
  const parsedOutput = parseSearchToolOutput(outputText)
  const errorText = typeof toolPart.errorText === "string"
    ? toolPart.errorText
    : outputText
  const text =
    state === "output-available"
      ? `Searched the web${query ? ` for "${query}"` : ""}`
      : state === "output-error"
        ? "Web search failed"
        : state === "output-denied"
          ? "Web search denied"
          : "Searching the web..."

  return (
    <div key={key} className="mb-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe className="h-3 w-3" />
        {text}
      </div>
      {state === "output-available" && outputText ? (
        <div className="mt-1 pl-4 border-l-2 border-border/30">
          <WebSearchResultContent outputText={outputText} parsedOutput={parsedOutput} />
        </div>
      ) : null}
      {state === "output-error" && errorText ? (
        <div className="mt-1 pl-4 border-l-2 border-destructive/40 text-xs text-destructive/90 whitespace-pre-wrap">
          {errorText}
        </div>
      ) : null}
    </div>
  )
}

type MessageListProps = {
  messages: UIMessage[]
  isLoading?: boolean
  bubbleStyle?: BubbleStyle
  onRetry?: () => void
}

export function MessageList({ messages, isLoading, bubbleStyle = "flat", onRetry }: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const greetingSeed = useId()

  // Pick a random greeting once per mount
  const greeting = useMemo(() => {
    let hash = 0
    for (const ch of greetingSeed) {
      hash = (hash * 31 + ch.charCodeAt(0)) % GREETINGS.length
    }
    return GREETINGS[hash]
  }, [greetingSeed])

  // Derive last message text content - changes with every streaming token.
  const lastMsg = messages[messages.length - 1]
  const lastMsgText = lastMsg?.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map(p => p.text)
    .join("") ?? ""

  // Track messages.length in a ref so scroll handler doesn't need re-registration
  const messagesLenRef = useRef(messages.length)
  useEffect(() => {
    messagesLenRef.current = messages.length
  }, [messages.length])

  // Listen for manual scroll events on the viewport (mount once)
  useEffect(() => {
    const viewport = getViewport(scrollAreaRef)
    if (!viewport) return

    const handleScroll = () => {
      const nearBottom = isNearBottom(viewport)
      isUserScrolledUp.current = !nearBottom
      setShowScrollBtn(!nearBottom && messagesLenRef.current > 0)
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [])

  // Auto-scroll when content changes (new messages or streaming tokens)
  useEffect(() => {
    if (isUserScrolledUp.current) return

    const viewport = getViewport(scrollAreaRef)
    if (!viewport) return

    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight
    })
  }, [messages.length, lastMsgText, isLoading])

  const scrollToBottom = useCallback(() => {
    const viewport = getViewport(scrollAreaRef)
    if (!viewport) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
    isUserScrolledUp.current = false
    setShowScrollBtn(false)
  }, [])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <JetLLMLogo className="mx-auto w-48 h-auto" />
          <p className="text-sm text-muted-foreground">{greeting}</p>
        </div>
      </div>
    )
  }

  const showThinking = isLoading && (
    messages.length === 0 || messages[messages.length - 1].role === "user"
  )
  const visibleMessages = messages.filter(m => m.role === "user" || m.role === "assistant")
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1]
  const canRetryLastAssistant = Boolean(
    lastVisibleMessage?.role === "assistant"
    && visibleMessages[visibleMessages.length - 2]?.role === "user"
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto"
        ref={scrollAreaRef}
      >
        <div className="max-w-3xl mx-auto py-6 space-y-2">
          {visibleMessages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role as "user" | "assistant"}
              bubbleStyle={bubbleStyle}
              actions={
                onRetry && !isLoading && canRetryLastAssistant && message.id === lastVisibleMessage?.id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onRetry}
                  >
                    <RotateCw className="h-3 w-3" />
                    Retry
                  </Button>
                ) : null
              }
            >
                {message.parts.map((part, i) => {
                  if (part.type === "reasoning") {
                    return <ReasoningBlock key={i} text={part.text} />
                  }
                  if (part.type === "text") {
                    return (
                      <div
                        key={i}
                        className="
                          text-sm max-w-none leading-relaxed
                          [&>p]:my-1
                          [&>ul]:my-1 [&>ol]:my-1
                          [&>ul>li]:my-0.5 [&>ol>li]:my-0.5
                          [&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:bg-black/30
                          [&_code]:text-[0.85em]
                          [&_h1]:my-1 [&_h1]:text-base [&_h1]:font-semibold
                          [&_h2]:my-1 [&_h2]:text-base [&_h2]:font-semibold
                          [&_h3]:my-1 [&_h3]:text-sm [&_h3]:font-semibold
                          [&_a]:text-current [&_a]:underline [&_a]:break-all
                        "
                      >
                        {renderMarkdownContent(part.text, `msg-${message.id}-part-${i}`)}
                      </div>
                    )
                  }
                  if (part.type === "file") {
                    return renderFilePart(part, i)
                  }
                  const toolIndicator = renderWebSearchIndicator(part, i)
                  if (toolIndicator) return toolIndicator
                  return null
                })}
            </ChatMessage>
          ))}
          {showThinking && (
            <ChatMessage role="assistant" bubbleStyle={bubbleStyle}>
              <span className="animate-pulse">Thinking...</span>
            </ChatMessage>
          )}
        </div>
      </div>
      {showScrollBtn && (
        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-4 right-4 z-10 h-8 w-8 rounded-full border-border/50 shadow-lg"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

