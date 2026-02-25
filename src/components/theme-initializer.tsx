"use client"

import { useEffect } from "react"

const CHAT_THEME_VARS: Record<string, string> = {
  chatBg: "--chat-bg",
  userBubble: "--chat-user-bubble",
  userBubbleFg: "--chat-user-bubble-fg",
  assistantBubble: "--chat-assistant-bubble",
  assistantBubbleFg: "--chat-assistant-bubble-fg",
  assistantBorder: "--chat-assistant-border",
}

export function ThemeInitializer() {
  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then((settings: Record<string, unknown>) => {
        // Apply accent color to all accent-derived variables
        const accent = settings["ui:accentColor"] as { hsl?: string } | undefined
        if (accent?.hsl) {
          const el = document.documentElement
          const color = `hsl(${accent.hsl})`
          el.style.setProperty("--accent-color", accent.hsl)
          el.style.setProperty("--primary", color)
          el.style.setProperty("--ring", color)
          el.style.setProperty("--sidebar-primary", color)
          el.style.setProperty("--sidebar-accent", `hsl(${accent.hsl} / 0.12)`)
          el.style.setProperty("--sidebar-ring", color)
          el.style.setProperty("--chart-1", color)
        }

        // Apply chat theme colors
        const chatTheme = settings["ui:chatTheme"] as { colors?: Record<string, string>; bgImage?: string } | undefined
        if (chatTheme?.colors) {
          const el = document.documentElement
          for (const [key, value] of Object.entries(chatTheme.colors)) {
            const cssVar = CHAT_THEME_VARS[key]
            if (!cssVar) continue
            // "accent" sentinel: don't set inline style, let CSS default handle it
            if (key === "userBubble" && value === "accent") {
              el.style.removeProperty(cssVar)
            } else {
              el.style.setProperty(cssVar, value)
            }
          }
        }
        if (chatTheme?.bgImage) {
          document.documentElement.style.setProperty("--chat-bg-image", `url(${chatTheme.bgImage})`)
        }
      })
      .catch(() => {})
  }, [])

  return null
}
