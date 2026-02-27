"use client"

import { cn } from "@/lib/utils"
import type { BubbleStyle } from "@/hooks/use-chat-theme"

type ChatMessageProps = {
  role: "user" | "assistant"
  bubbleStyle?: BubbleStyle
  children: React.ReactNode
}

export function ChatMessage({ role, bubbleStyle = "flat", children }: ChatMessageProps) {
  const isUser = role === "user"

  // Flat: current behavior — subtle tint on user, nothing on assistant
  if (bubbleStyle === "flat") {
    return (
      <div
        className={cn(
          "px-4 py-4",
          isUser && "bg-white/[0.03] rounded-2xl"
        )}
        style={{ color: isUser
          ? "var(--chat-user-bubble-fg, var(--chat-text-color))"
          : "var(--chat-assistant-bubble-fg, var(--chat-text-color))"
        }}
      >
        <div className="text-sm leading-relaxed" style={{ fontFamily: "var(--chat-font)" }}>
          {children}
        </div>
      </div>
    )
  }

  // Minimal: rounded rectangles, left-aligned, theme colors applied
  if (bubbleStyle === "minimal") {
    return (
      <div
        className="px-4 py-3 rounded-2xl"
        style={{
          backgroundColor: isUser
            ? "var(--chat-user-bubble)"
            : "var(--chat-assistant-bubble)",
          color: isUser
            ? "var(--chat-user-bubble-fg, var(--chat-text-color))"
            : "var(--chat-assistant-bubble-fg, var(--chat-text-color))",
        }}
      >
        <div className="text-sm leading-relaxed" style={{ fontFamily: "var(--chat-font)" }}>
          {children}
        </div>
      </div>
    )
  }

  // Full: classic chat bubbles with alignment
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "px-4 py-3 max-w-[80%]",
          isUser
            ? "rounded-2xl rounded-br-md"
            : "rounded-2xl rounded-bl-md",
        )}
        style={{
          backgroundColor: isUser
            ? "var(--chat-user-bubble)"
            : "var(--chat-assistant-bubble)",
          color: isUser
            ? "var(--chat-user-bubble-fg, var(--chat-text-color))"
            : "var(--chat-assistant-bubble-fg, var(--chat-text-color))",
        }}
      >
        <div className="text-sm leading-relaxed" style={{ fontFamily: "var(--chat-font)" }}>
          {children}
        </div>
      </div>
    </div>
  )
}
