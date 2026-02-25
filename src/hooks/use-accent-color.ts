"use client"

import { useState, useEffect, useCallback } from "react"

export type AccentPreset = {
  name: string
  hsl: string
  hex: string
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { name: "Blue", hsl: "220 90% 56%", hex: "#3b82f6" },
  { name: "Purple", hsl: "270 76% 53%", hex: "#8b5cf6" },
  { name: "Green", hsl: "142 71% 45%", hex: "#22c55e" },
  { name: "Red", hsl: "0 84% 60%", hex: "#ef4444" },
  { name: "Orange", hsl: "25 95% 53%", hex: "#f97316" },
  { name: "Pink", hsl: "330 81% 60%", hex: "#ec4899" },
  { name: "Cyan", hsl: "188 94% 43%", hex: "#06b6d4" },
] as const

// All CSS variables that should reflect the accent color
function applyAccent(hsl: string) {
  const el = document.documentElement
  const color = `hsl(${hsl})`
  el.style.setProperty("--accent-color", hsl)
  // Set all accent-derived variables directly (bypasses CSS cascade issues with Tailwind v4)
  el.style.setProperty("--primary", color)
  el.style.setProperty("--ring", color)
  el.style.setProperty("--sidebar-primary", color)
  el.style.setProperty("--sidebar-accent", `hsl(${hsl} / 0.12)`)
  el.style.setProperty("--sidebar-ring", color)
  el.style.setProperty("--chart-1", color)
  // Remove user bubble override so CSS default follows accent
  el.style.removeProperty("--chat-user-bubble")
}

export function useAccentColor() {
  const [accent, setAccentState] = useState<AccentPreset>(ACCENT_PRESETS[0])

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then((settings: Record<string, unknown>) => {
        const saved = settings["ui:accentColor"] as { hsl?: string } | undefined
        if (saved?.hsl) {
          const match = ACCENT_PRESETS.find(p => p.hsl === saved.hsl)
          if (match) {
            setAccentState(match)
            applyAccent(match.hsl)
          }
        }
      })
  }, [])

  const setAccent = useCallback((preset: AccentPreset) => {
    setAccentState(preset)
    applyAccent(preset.hsl)
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "ui:accentColor",
        value: { name: preset.name, hsl: preset.hsl },
      }),
    })
  }, [])

  return { accent, setAccent, presets: ACCENT_PRESETS }
}
