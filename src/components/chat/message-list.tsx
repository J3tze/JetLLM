"use client"

import { useState, useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatMessage } from "./chat-message"
import { Bot, ChevronDown } from "lucide-react"
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

type MessageListProps = {
  messages: UIMessage[]
  isLoading?: boolean
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, isLoading])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">JetLLM</h2>
            <p className="text-sm text-muted-foreground">Send a message to start chatting</p>
          </div>
        </div>
      </div>
    )
  }

  const showThinking = isLoading && (
    messages.length === 0 || messages[messages.length - 1].role === "user"
  )

  return (
    <ScrollArea className="flex-1">
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
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
