"use client"

import { useState, useEffect, useCallback } from "react"

export type ChatThemeColors = {
  chatBg: string
  userBubble: string // hex or "accent" to follow accent color
  userBubbleFg: string
  assistantBubble: string
  assistantBubbleFg: string
  assistantBorder: string
}

// Sentinel value: user bubble follows accent color
export const USER_BUBBLE_ACCENT = "accent"

export type ChatThemePreset = {
  name: string
  colors: ChatThemeColors
}

export const CHAT_THEME_PRESETS: readonly ChatThemePreset[] = [
  {
    name: "AMOLED Black",
    colors: {
      chatBg: "#000000",
      userBubble: USER_BUBBLE_ACCENT,
      userBubbleFg: "#ffffff",
      assistantBubble: "#131313",
      assistantBubbleFg: "#fafafa",
      assistantBorder: "#ffffff14",
    },
  },
  {
    name: "Dark Gray",
    colors: {
      chatBg: "#0a0a0a",
      userBubble: USER_BUBBLE_ACCENT,
      userBubbleFg: "#ffffff",
      assistantBubble: "#1c1c1c",
      assistantBubbleFg: "#e5e5e5",
      assistantBorder: "#ffffff1a",
    },
  },
  {
    name: "Midnight Blue",
    colors: {
      chatBg: "#0a0e1a",
      userBubble: USER_BUBBLE_ACCENT,
      userBubbleFg: "#ffffff",
      assistantBubble: "#111827",
      assistantBubbleFg: "#e0e7ff",
      assistantBorder: "#3b82f633",
    },
  },
] as const

const CSS_VAR_MAP: Record<keyof ChatThemeColors, string> = {
  chatBg: "--chat-bg",
  userBubble: "--chat-user-bubble",
  userBubbleFg: "--chat-user-bubble-fg",
  assistantBubble: "--chat-assistant-bubble",
  assistantBubbleFg: "--chat-assistant-bubble-fg",
  assistantBorder: "--chat-assistant-border",
}

function applyChatTheme(colors: ChatThemeColors) {
  const el = document.documentElement
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = colors[key as keyof ChatThemeColors]
    if (key === "userBubble" && value === USER_BUBBLE_ACCENT) {
      // Remove inline override so CSS default hsl(var(--accent-color)) stays live
      el.style.removeProperty(cssVar)
    } else {
      el.style.setProperty(cssVar, value)
    }
  }
}

function applyBgImage(url: string) {
  document.documentElement.style.setProperty("--chat-bg-image", url ? `url(${url})` : "none")
}

export function useChatTheme() {
  const [colors, setColors] = useState<ChatThemeColors>(CHAT_THEME_PRESETS[0].colors)
  const [presetName, setPresetName] = useState<string | null>("AMOLED Black")
  const [bgImage, setBgImageState] = useState<string>("")

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then((settings: Record<string, unknown>) => {
        const saved = settings["ui:chatTheme"] as { preset?: string; colors?: ChatThemeColors; bgImage?: string } | undefined
        if (saved?.colors) {
          setColors(saved.colors)
          setPresetName(saved.preset ?? null)
          applyChatTheme(saved.colors)
        }
        if (saved?.bgImage) {
          setBgImageState(saved.bgImage)
          applyBgImage(saved.bgImage)
        }
      })
      .catch(() => {})
  }, [])

  const persistTheme = useCallback((newColors: ChatThemeColors, preset: string | null, newBgImage: string) => {
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "ui:chatTheme",
        value: { preset, colors: newColors, bgImage: newBgImage },
      }),
    }).catch(() => {})
  }, [])

  const saveTheme = useCallback((newColors: ChatThemeColors, preset: string | null) => {
    setColors(newColors)
    setPresetName(preset)
    applyChatTheme(newColors)
    persistTheme(newColors, preset, bgImage)
  }, [bgImage, persistTheme])

  const setBgImage = useCallback((url: string) => {
    setBgImageState(url)
    applyBgImage(url)
    persistTheme(colors, presetName, url)
  }, [colors, presetName, persistTheme])

  const setThemePreset = useCallback((preset: ChatThemePreset) => {
    saveTheme(preset.colors, preset.name)
  }, [saveTheme])

  const setCustomColor = useCallback((key: keyof ChatThemeColors, hex: string) => {
    const newColors = { ...colors, [key]: hex }
    // Setting userBubble back to "accent" shouldn't mark as custom
    const isResetToAccent = key === "userBubble" && hex === USER_BUBBLE_ACCENT
    saveTheme(newColors, isResetToAccent ? presetName : null)
  }, [colors, presetName, saveTheme])

  return {
    colors,
    presetName,
    presets: CHAT_THEME_PRESETS,
    setThemePreset,
    setCustomColor,
    bgImage,
    setBgImage,
  }
}
