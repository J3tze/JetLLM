"use client"

import { useState, useEffect, useCallback } from "react"

export type ChatThemeColors = {
  chatBg: string
  userBubble: string // hex or "accent" to follow accent color
  userBubbleFg: string
  assistantBubble: string
  assistantBubbleFg: string
  assistantBorder: string
  textColor: string // global chat text color
}

// Sentinel value: user bubble follows accent color
export const USER_BUBBLE_ACCENT = "accent"

export type BubbleStyle = "flat" | "minimal" | "full"

export const CHAT_FONTS = [
  { name: "Geist Sans", family: "var(--font-geist-sans)", builtin: true },
  { name: "Geist Mono", family: "var(--font-geist-mono)", builtin: true },
  { name: "Inter", family: "'Inter'", builtin: false },
  { name: "Plus Jakarta Sans", family: "'Plus Jakarta Sans'", builtin: false },
  { name: "Merriweather", family: "'Merriweather'", builtin: false },
  { name: "Lora", family: "'Lora'", builtin: false },
  { name: "JetBrains Mono", family: "'JetBrains Mono'", builtin: false },
  { name: "Nunito", family: "'Nunito'", builtin: false },
] as const

export type ChatFont = (typeof CHAT_FONTS)[number]

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
      textColor: "#fafafa",
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
      textColor: "#e5e5e5",
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
      textColor: "#e0e7ff",
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
  textColor: "--chat-text-color",
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
  if (url) {
    document.documentElement.dataset.wallpaper = ""
  } else {
    delete document.documentElement.dataset.wallpaper
  }
}

function applyGlassOpacity(opacity: number) {
  document.documentElement.style.setProperty("--glass-opacity", String(opacity))
}

function applyFont(fontName: string) {
  const fontDef = CHAT_FONTS.find(f => f.name === fontName)
  if (!fontDef) return

  // Load external font via Google Fonts if not builtin
  if (!fontDef.builtin) {
    const linkId = `chat-font-${fontName.replace(/\s+/g, "-").toLowerCase()}`
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link")
      link.id = linkId
      link.rel = "stylesheet"
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
  }

  document.documentElement.style.setProperty("--chat-font", fontDef.family)
}

function applyBubbleStyle(style: BubbleStyle) {
  document.documentElement.dataset.bubbleStyle = style
}

export function useChatTheme() {
  const [colors, setColors] = useState<ChatThemeColors>(CHAT_THEME_PRESETS[0].colors)
  const [presetName, setPresetName] = useState<string | null>("AMOLED Black")
  const [bgImage, setBgImageState] = useState<string>("")
  const [glassOpacity, setGlassOpacityState] = useState(0.7)
  const [font, setFontState] = useState<string>("Geist Sans")
  const [bubbleStyle, setBubbleStyleState] = useState<BubbleStyle>("flat")

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then((settings: Record<string, unknown>) => {
        const saved = settings["ui:chatTheme"] as { preset?: string; colors?: ChatThemeColors; bgImage?: string; glassOpacity?: number; font?: string; bubbleStyle?: string } | undefined
        if (saved?.colors) {
          // Merge with defaults so old saved themes without new fields still work
          const merged = { ...CHAT_THEME_PRESETS[0].colors, ...saved.colors }
          setColors(merged)
          setPresetName(saved.preset ?? null)
          applyChatTheme(merged)
        }
        if (saved?.bgImage) {
          setBgImageState(saved.bgImage)
          applyBgImage(saved.bgImage)
        }
        if (saved?.glassOpacity !== undefined) {
          setGlassOpacityState(saved.glassOpacity)
          applyGlassOpacity(saved.glassOpacity)
        }
        if (saved?.font) {
          setFontState(saved.font)
          applyFont(saved.font)
        }
        if (saved?.bubbleStyle) {
          setBubbleStyleState(saved.bubbleStyle as BubbleStyle)
          applyBubbleStyle(saved.bubbleStyle as BubbleStyle)
        }
      })
      .catch(() => {})
  }, [])

  const persistTheme = useCallback((newColors: ChatThemeColors, preset: string | null, newBgImage: string, newGlassOpacity: number, newFont: string, newBubbleStyle: BubbleStyle) => {
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "ui:chatTheme",
        value: { preset, colors: newColors, bgImage: newBgImage, glassOpacity: newGlassOpacity, font: newFont, bubbleStyle: newBubbleStyle },
      }),
    }).catch(() => {})
  }, [])

  const saveTheme = useCallback((newColors: ChatThemeColors, preset: string | null) => {
    setColors(newColors)
    setPresetName(preset)
    applyChatTheme(newColors)
    persistTheme(newColors, preset, bgImage, glassOpacity, font, bubbleStyle)
  }, [bgImage, glassOpacity, font, bubbleStyle, persistTheme])

  const setBgImage = useCallback((url: string) => {
    setBgImageState(url)
    applyBgImage(url)
    persistTheme(colors, presetName, url, glassOpacity, font, bubbleStyle)
  }, [colors, presetName, glassOpacity, font, bubbleStyle, persistTheme])

  const setGlassOpacity = useCallback((opacity: number) => {
    setGlassOpacityState(opacity)
    applyGlassOpacity(opacity)
    persistTheme(colors, presetName, bgImage, opacity, font, bubbleStyle)
  }, [colors, presetName, bgImage, font, bubbleStyle, persistTheme])

  const setThemePreset = useCallback((preset: ChatThemePreset) => {
    saveTheme(preset.colors, preset.name)
  }, [saveTheme])

  const setCustomColor = useCallback((key: keyof ChatThemeColors, hex: string) => {
    const newColors = { ...colors, [key]: hex }
    // Setting userBubble back to "accent" shouldn't mark as custom
    const isResetToAccent = key === "userBubble" && hex === USER_BUBBLE_ACCENT
    saveTheme(newColors, isResetToAccent ? presetName : null)
  }, [colors, presetName, saveTheme])

  const setFont = useCallback((fontName: string) => {
    setFontState(fontName)
    applyFont(fontName)
    persistTheme(colors, presetName, bgImage, glassOpacity, fontName, bubbleStyle)
  }, [colors, presetName, bgImage, glassOpacity, bubbleStyle, persistTheme])

  const setBubbleStyle = useCallback((style: BubbleStyle) => {
    setBubbleStyleState(style)
    applyBubbleStyle(style)
    persistTheme(colors, presetName, bgImage, glassOpacity, font, style)
  }, [colors, presetName, bgImage, glassOpacity, font, persistTheme])

  return {
    colors,
    presetName,
    presets: CHAT_THEME_PRESETS,
    setThemePreset,
    setCustomColor,
    bgImage,
    setBgImage,
    glassOpacity,
    setGlassOpacity,
    font,
    setFont,
    fonts: CHAT_FONTS,
    bubbleStyle,
    setBubbleStyle,
  }
}
