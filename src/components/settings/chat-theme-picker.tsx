"use client"

import { useState, useEffect, useRef } from "react"
import { type BubbleStyle, type ChatFont, CHAT_FONTS, USER_BUBBLE_ACCENT, type ChatThemeColors, type ChatThemePreset } from "@/hooks/use-chat-theme"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ImagePlus, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2 MB

const COLOR_ROWS: Array<{
  key: keyof ChatThemeColors
  label: string
  allowTransparency?: boolean
}> = [
  { key: "chatBg", label: "Chat Background", allowTransparency: true },
  { key: "textColor", label: "Chat Text Color" },
  { key: "userBubble", label: "User Bubble", allowTransparency: true },
  { key: "userBubbleFg", label: "User Text" },
  { key: "assistantBubble", label: "Assistant Bubble", allowTransparency: true },
  { key: "assistantBorder", label: "Assistant Border", allowTransparency: true },
  { key: "assistantBubbleFg", label: "Assistant Text" },
]

function parseColorControlValue(value: string): { hex: string; alpha: number } {
  const normalized = value.trim()

  if (/^#[0-9a-fA-F]{8}$/.test(normalized)) {
    return {
      hex: normalized.slice(0, 7),
      alpha: Number.parseInt(normalized.slice(7, 9), 16) / 255,
    }
  }

  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return { hex: normalized, alpha: 1 }
  }

  return { hex: "#000000", alpha: 1 }
}

function formatColorWithAlpha(hex: string, alpha: number): string {
  const normalizedHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000"
  const clampedAlpha = Math.max(0, Math.min(1, alpha))

  if (clampedAlpha >= 0.999) {
    return normalizedHex
  }

  const alphaHex = Math.round(clampedAlpha * 255).toString(16).padStart(2, "0")
  return `${normalizedHex}${alphaHex}`
}

function ColorRow({
  label,
  value,
  hint,
  allowTransparency,
  onChange,
}: {
  label: string
  value: string
  hint?: string
  allowTransparency?: boolean
  onChange: (color: string) => void
}) {
  const parsedValue = parseColorControlValue(value)
  const [inputValue, setInputValue] = useState(parsedValue.hex)

  const handleTextChange = (text: string) => {
    setInputValue(text)
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      onChange(formatColorWithAlpha(text, parsedValue.alpha))
    }
  }

  const handleTransparencyChange = ([transparency = 0]: number[]) => {
    const activeHex = /^#[0-9a-fA-F]{6}$/.test(inputValue) ? inputValue : parsedValue.hex
    onChange(formatColorWithAlpha(activeHex, 1 - (transparency / 100)))
  }

  const transparencyValue = Math.round((1 - parsedValue.alpha) * 100)

  return (
    <div className="space-y-2.5 rounded-xl border border-border/50 bg-card/40 p-3">
      <div className="flex items-center gap-3">
        <div className="w-32 shrink-0">
          <Label className="text-sm text-muted-foreground">{label}</Label>
          {hint && <p className="text-[10px] text-muted-foreground/60">{hint}</p>}
        </div>
        <input
          type="color"
          value={inputValue.slice(0, 7).toLowerCase()}
          onChange={(e) => {
            setInputValue(e.target.value)
            onChange(formatColorWithAlpha(e.target.value, parsedValue.alpha))
          }}
          className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <Input
          value={inputValue}
          onChange={(e) => handleTextChange(e.target.value)}
          className="w-24 font-mono text-xs"
          placeholder="#000000"
        />
      </div>
      {allowTransparency ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Transparency</span>
            <span className="text-xs font-mono text-muted-foreground">{transparencyValue}%</span>
          </div>
          <Slider
            value={[transparencyValue]}
            onValueChange={handleTransparencyChange}
            min={0}
            max={100}
            step={1}
          />
        </div>
      ) : null}
    </div>
  )
}

type ChatThemeState = {
  colors: ChatThemeColors
  presetName: string | null
  presets: readonly ChatThemePreset[]
  setThemePreset: (preset: ChatThemePreset) => void
  setCustomColor: (key: keyof ChatThemeColors, hex: string) => void
  bgImage: string
  setBgImage: (url: string) => void
  glassOpacity: number
  setGlassOpacity: (opacity: number) => void
  font: string
  setFont: (fontName: string) => void
  fonts: readonly ChatFont[]
  bubbleStyle: BubbleStyle
  setBubbleStyle: (style: BubbleStyle) => void
}

export function ChatThemePicker({ accentHex, chatThemeState }: { accentHex: string; chatThemeState: ChatThemeState }) {
  const { colors, presetName, presets, setThemePreset, setCustomColor, bgImage, setBgImage, glassOpacity, setGlassOpacity, font, setFont, fonts, bubbleStyle, setBubbleStyle } = chatThemeState
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Preload all external fonts so the font selector shows proper previews
    CHAT_FONTS.filter(f => !f.builtin).forEach(f => {
      const linkId = `chat-font-preview-${f.name.replace(/\s+/g, "-").toLowerCase()}`
      if (!document.getElementById(linkId)) {
        const link = document.createElement("link")
        link.id = linkId
        link.rel = "stylesheet"
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.name)}:wght@400;500&display=swap`
        document.head.appendChild(link)
      }
    })
  }, [])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be smaller than 2 MB")
      e.target.value = ""
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setBgImage(reader.result as string)
    }
    reader.onerror = () => toast.error("Failed to read image file")
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const displayColors = {
    ...colors,
    userBubble: colors.userBubble === USER_BUBBLE_ACCENT ? accentHex : colors.userBubble,
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Chat Theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Presets</Label>
          <div className="flex flex-wrap gap-2">
            {presets.map(preset => (
              <button
                key={preset.name}
                onClick={() => setThemePreset(preset)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all",
                  presetName === preset.name
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
                )}
              >
                <span
                  className="h-3 w-3 rounded-full border border-border/50"
                  style={{ backgroundColor: preset.colors.assistantBubble }}
                />
                {preset.name}
              </button>
            ))}
            {presetName === null ? (
              <span className="flex items-center rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-sm text-foreground">
                Custom
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Bubble Style</Label>
          <div className="flex flex-wrap gap-2">
            {(["flat", "minimal", "full"] as const).map(style => (
              <button
                key={style}
                onClick={() => setBubbleStyle(style)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all",
                  bubbleStyle === style
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
                )}
              >
                {style === "flat" && "Flat"}
                {style === "minimal" && "Minimal"}
                {style === "full" && "Full Bubbles"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Chat Font</Label>
          <div className="flex flex-wrap gap-2">
            {fonts.map(f => (
              <button
                key={f.name}
                onClick={() => setFont(f.name)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-all",
                  font === f.name
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
                )}
                style={{ fontFamily: f.family }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <Label className="text-xs text-muted-foreground">Colors</Label>
          {COLOR_ROWS.map(({ key, label, allowTransparency }) => (
            <ColorRow
              key={`${key}:${displayColors[key]}`}
              label={label}
              value={displayColors[key]}
              allowTransparency={allowTransparency}
              hint={
                key === "userBubble" && colors.userBubble === USER_BUBBLE_ACCENT
                  ? "Follows accent until customized"
                  : key === "userBubbleFg" && colors.userBubbleFg === colors.textColor
                    ? "Follows global"
                    : key === "assistantBubbleFg" && colors.assistantBubbleFg === colors.textColor
                      ? "Follows global"
                      : undefined
              }
              onChange={(nextColor) => setCustomColor(key, nextColor)}
            />
          ))}
        </div>

        <div className="space-y-2 pt-1">
          <Label className="text-xs text-muted-foreground">Background Image</Label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              {bgImage ? "Change" : "Upload"}
            </Button>
            {bgImage ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => setBgImage("")}
              >
                <X className="h-3 w-3" />
                Remove
              </Button>
            ) : null}
          </div>
          {bgImage ? (
            <div
              className="h-16 w-full rounded-lg border border-border bg-cover bg-center"
              style={{ backgroundImage: `url("${bgImage.replace(/"/g, "%22")}")` }}
            />
          ) : null}
        </div>

        {bgImage ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Panel Transparency</Label>
              <span className="text-xs font-mono text-muted-foreground">{Math.round((1 - glassOpacity) * 100)}%</span>
            </div>
            <Slider
              value={[1 - glassOpacity]}
              onValueChange={([v]) => setGlassOpacity(1 - v)}
              min={0}
              max={0.95}
              step={0.05}
            />
            <p className="text-[10px] text-muted-foreground/60">
              Controls sidebar and menu opacity over the wallpaper
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
