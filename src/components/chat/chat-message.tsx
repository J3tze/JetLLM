"use client"

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import type { BubbleStyle } from "@/hooks/use-chat-theme"

type ChatMessageProps = {
  role: "user" | "assistant"
  bubbleStyle?: BubbleStyle
  children: React.ReactNode
  actions?: React.ReactNode
}

function getSurfaceStyle(isUser: boolean): CSSProperties {
  return {
    backgroundColor: isUser
      ? "var(--chat-user-bubble)"
      : "var(--chat-assistant-bubble)",
    borderColor: isUser
      ? "rgba(255, 255, 255, 0.14)"
      : "var(--chat-assistant-border, rgba(255, 255, 255, 0.08))",
    color: isUser
      ? "var(--chat-user-bubble-fg, var(--chat-text-color))"
      : "var(--chat-assistant-bubble-fg, var(--chat-text-color))",
    boxShadow: isUser
      ? "0 18px 40px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.12)"
      : "0 18px 40px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  }
}

function MessageSurface({
  className,
  style,
  children,
  actions,
}: {
  className: string
  style: CSSProperties
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className={className} style={style}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0)_38%)] opacity-80" />
      <div className="relative text-[15px] leading-7" style={{ fontFamily: "var(--chat-font)" }}>
        {children}
      </div>
      {actions ? <div className="relative mt-3 pt-1">{actions}</div> : null}
    </div>
  )
}

export function ChatMessage({ role, bubbleStyle = "flat", children, actions }: ChatMessageProps) {
  const isUser = role === "user"
  const surfaceStyle = getSurfaceStyle(isUser)

  if (bubbleStyle === "flat") {
    return (
      <div className="px-1 sm:px-2">
        <MessageSurface
          className={cn(
            "relative overflow-hidden border px-5 py-4 backdrop-blur-sm",
            isUser
              ? "ml-auto max-w-[88%] rounded-[2.9rem]"
              : "w-full rounded-[2.9rem]"
          )}
          style={surfaceStyle}
          actions={actions}
        >
          {children}
        </MessageSurface>
      </div>
    )
  }

  if (bubbleStyle === "minimal") {
    return (
      <div className={cn("flex px-1 sm:px-2", isUser ? "justify-end" : "justify-start")}>
        <MessageSurface
          className={cn(
            "relative max-w-[88%] overflow-hidden rounded-[2.55rem] border px-[1.125rem] py-3.5 backdrop-blur-sm",
            isUser ? "rounded-br-[1.6rem]" : "rounded-bl-[1.6rem]"
          )}
          style={surfaceStyle}
          actions={actions}
        >
          {children}
        </MessageSurface>
      </div>
    )
  }

  return (
    <div className={cn("flex px-1 sm:px-2", isUser ? "justify-end" : "justify-start")}>
      <MessageSurface
        className={cn(
          "relative max-w-[84%] overflow-hidden border px-[1.125rem] py-3.5 backdrop-blur-sm",
          isUser
            ? "rounded-[2.7rem] rounded-br-[1.45rem]"
            : "rounded-[2.7rem] rounded-bl-[1.45rem]"
        )}
        style={surfaceStyle}
        actions={actions}
      >
        {children}
      </MessageSurface>
    </div>
  )
}
