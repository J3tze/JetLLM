"use client"

import { useEffect } from "react"
import { CHAT_FONTS } from "@/hooks/use-chat-theme"

const CHAT_THEME_VARS: Record<string, string> = {
  chatBg: "--chat-bg",
  userBubble: "--chat-user-bubble",
  userBubbleFg: "--chat-user-bubble-fg",
  assistantBubble: "--chat-assistant-bubble",
  assistantBubbleFg: "--chat-assistant-bubble-fg",
  assistantBorder: "--chat-assistant-border",
  textColor: "--chat-text-color",
}

const WALLPAPER_ID = "jetllm-wallpaper"
const DEFAULT_WALLPAPER = "/default-wallpaper.jpg"

function applyWallpaper(bgColor: string, bgImage?: string) {
  let el = document.getElementById(WALLPAPER_ID)
  if (!el) {
    el = document.createElement("div")
    el.id = WALLPAPER_ID
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "-1",
      backgroundSize: "cover",
      backgroundPosition: "center bottom",
      backgroundRepeat: "no-repeat",
    })
    document.body.prepend(el)
  }
  el.style.backgroundColor = bgColor
  if (bgImage) {
    const safeUrl = bgImage.replace(/"/g, "%22")
    el.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url("${safeUrl}")`
  } else {
    el.style.backgroundImage = "none"
  }
}

export function ThemeInitializer() {
  useEffect(() => {
    fetch("/api/settings?keys=ui:accentColor,ui:chatTheme")
      .then(res => {
        if (!res.ok) throw new Error(`Settings fetch failed: ${res.status}`)
        return res.json()
      })
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
        const chatTheme = settings["ui:chatTheme"] as { colors?: Record<string, string>; bgImage?: string; glassOpacity?: number; font?: string; bubbleStyle?: string } | undefined
        if (chatTheme?.colors) {
          const el = document.documentElement
          for (const [key, value] of Object.entries(chatTheme.colors)) {
            const cssVar = CHAT_THEME_VARS[key]
            if (!cssVar) continue
            if (key === "userBubble" && value === "accent") {
              el.style.removeProperty(cssVar)
            } else {
              el.style.setProperty(cssVar, value)
            }
          }
        }

        // Apply wallpaper and signal wallpaper mode for CSS (glass sidebar, etc.)
        // Use default wallpaper on fresh installs (no bgImage saved yet)
        const bgColor = chatTheme?.colors?.chatBg || "#000000"
        const bgImage = chatTheme?.bgImage ?? DEFAULT_WALLPAPER
        applyWallpaper(bgColor, bgImage)
        if (bgImage) {
          document.documentElement.dataset.wallpaper = ""
        } else {
          delete document.documentElement.dataset.wallpaper
        }
        if (chatTheme?.glassOpacity !== undefined) {
          document.documentElement.style.setProperty("--glass-opacity", String(chatTheme.glassOpacity))
        }

        // Apply font (deduplicate link tags)
        if (chatTheme?.font) {
          const fontDef = CHAT_FONTS.find((f: { name: string }) => f.name === chatTheme.font)
          if (fontDef && !fontDef.builtin) {
            const linkId = `chat-font-${chatTheme.font.replace(/\s+/g, "-").toLowerCase()}`
            if (!document.getElementById(linkId)) {
              const link = document.createElement("link")
              link.id = linkId
              link.rel = "stylesheet"
              link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(chatTheme.font)}:wght@300;400;500;600;700&display=swap`
              document.head.appendChild(link)
            }
          }
          if (fontDef) {
            document.documentElement.style.setProperty("--chat-font", fontDef.family)
          }
        }

        // Apply bubble style
        if (chatTheme?.bubbleStyle) {
          document.documentElement.dataset.bubbleStyle = chatTheme.bubbleStyle
        }
      })
      .catch((err) => console.warn("[ThemeInitializer] Failed to load settings:", err))
  }, [])

  return null
}
