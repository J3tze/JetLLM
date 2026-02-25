"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatMessage } from "./chat-message"
import { ChevronDown } from "lucide-react"
import { JetLLMLogo } from "@/components/jetllm-logo"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UIMessage } from "ai"

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
  return ref.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
}

function isNearBottom(viewport: HTMLElement, threshold = 80) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < threshold
}

type MessageListProps = {
  messages: UIMessage[]
  isLoading?: boolean
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  // Pick a random greeting once per mount
  const greeting = useMemo(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)], [])

  // Derive last message text content — changes with every streaming token
  const lastMsg = messages[messages.length - 1]
  const lastMsgText = lastMsg?.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map(p => p.text)
    .join("") ?? ""

  // Listen for manual scroll events on the viewport
  useEffect(() => {
    const viewport = getViewport(scrollAreaRef)
    if (!viewport) return

    const handleScroll = () => {
      const nearBottom = isNearBottom(viewport)
      isUserScrolledUp.current = !nearBottom
      setShowScrollBtn(!nearBottom && messages.length > 0)
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [messages.length])

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
      <div className="flex-1 flex items-center justify-center bg-cover bg-center bg-no-repeat" style={{ backgroundColor: "var(--chat-bg)", backgroundImage: "var(--chat-bg-image)" }}>
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

  return (
    <div className="relative flex-1 flex flex-col">
      <ScrollArea className="flex-1 bg-cover bg-center bg-no-repeat" ref={scrollAreaRef} style={{ backgroundColor: "var(--chat-bg)", backgroundImage: "var(--chat-bg-image)" }}>
        <div className="max-w-3xl mx-auto py-4">
          {messages
            .filter(m => m.role === "user" || m.role === "assistant")
            .map((message) => (
              <ChatMessage key={message.id} role={message.role as "user" | "assistant"}>
                {message.parts.map((part, i) => {
                  if (part.type === "reasoning") {
                    return <ReasoningBlock key={i} text={part.text} />
                  }
                  if (part.type === "text") {
                    return <span key={i}>{part.text}</span>
                  }
                  return null
                })}
              </ChatMessage>
            ))}
          {showThinking && (
            <ChatMessage role="assistant">
              <span className="animate-pulse">Thinking...</span>
            </ChatMessage>
          )}
        </div>
      </ScrollArea>
      {showScrollBtn && (
        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-4 right-4 rounded-full shadow-lg z-10 h-8 w-8 bg-secondary/80 backdrop-blur-sm"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
