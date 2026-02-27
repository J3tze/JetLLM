"use client"

import { cn } from "@/lib/utils"

type ChatMessageProps = {
  role: "user" | "assistant"
  children: React.ReactNode
}

export function ChatMessage({ role, children }: ChatMessageProps) {
  const isUser = role === "user"

  return (
    <div
      className={cn(
        "px-4 py-4",
        isUser && "bg-white/[0.03] rounded-2xl"
      )}
    >
      <div className="text-sm leading-relaxed">
        {children}
      </div>
    </div>
  )
}
