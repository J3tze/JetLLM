"use client"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { User, Bot } from "lucide-react"

type ChatMessageProps = {
  role: "user" | "assistant"
  children: React.ReactNode
}

export function ChatMessage({ role, children }: ChatMessageProps) {
  const isUser = role === "user"

  return (
    <div className={cn("flex gap-3 px-4 py-3", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
        <AvatarFallback
          className="bg-secondary text-secondary-foreground"
          style={isUser
            ? { backgroundColor: "var(--chat-user-bubble)", color: "var(--chat-user-bubble-fg)" }
            : undefined
          }
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div
        className="rounded-2xl px-4 py-2.5 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap backdrop-blur-sm"
        style={isUser
          ? { backgroundColor: "var(--chat-user-bubble)", color: "var(--chat-user-bubble-fg)" }
          : {
              backgroundColor: "color-mix(in srgb, var(--chat-assistant-bubble) 85%, transparent)",
              color: "var(--chat-assistant-bubble-fg)",
              border: "1px solid var(--chat-assistant-border)",
            }
        }
      >
        {children}
      </div>
    </div>
  )
}
