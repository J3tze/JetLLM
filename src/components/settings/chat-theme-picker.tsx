"use client"

import { useState, useEffect, useRef } from "react"
import { USER_BUBBLE_ACCENT, type ChatThemeColors, type ChatThemePreset } from "@/hooks/use-chat-theme"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ImagePlus, X } from "lucide-react"
import { cn } from "@/lib/utils"

const COLOR_ROWS: { key: keyof ChatThemeColors; label: string }[] = [
  { key: "userBubble", label: "User Bubble" },
  { key: "userBubbleFg", label: "User Text" },
  { key: "assistantBubble", label: "Assistant Bubble" },
  { key: "assistantBubbleFg", label: "Assistant Text" },
  { key: "chatBg", label: "Chat Background" },
]

function ColorRow({
  label,
  value,
  hint,
  onChange,
}: {
  label: string
  value: string
  hint?: string
  onChange: (hex: string) => void
}) {
  const [inputValue, setInputValue] = useState(value)

  // Sync input when value changes externally (preset selection, accent change)
  useEffect(() => {
    setInputValue(value.slice(0, 7))
  }, [value])

  const handleTextChange = (text: string) => {
    setInputValue(text)
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      onChange(text)
    }
  }

  return (
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
          onChange(e.target.value)
        }}
        className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5"
      />
      <Input
        value={inputValue}
        onChange={(e) => handleTextChange(e.target.value)}
        className="w-24 font-mono text-xs"
        placeholder="#000000"
      />
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
}

export function ChatThemePicker({ accentHex, chatThemeState }: { accentHex: string; chatThemeState: ChatThemeState }) {
  const { colors, presetName, presets, setThemePreset, setCustomColor, bgImage, setBgImage } = chatThemeState
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setBgImage(reader.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = "" // reset so same file can be re-selected
  }

  // Resolve "accent" sentinel to actual hex for display
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
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border",
                  presetName === preset.name
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
                )}
              >
                <span
                  className="w-3 h-3 rounded-full border border-border/50"
                  style={{ backgroundColor: preset.colors.assistantBubble }}
                />
                {preset.name}
              </button>
            ))}
            {presetName === null && (
              <span className="flex items-center px-3 py-1.5 rounded-lg text-sm border border-primary bg-primary/10 text-foreground">
                Custom
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <Label className="text-xs text-muted-foreground">Colors</Label>
          {COLOR_ROWS.map(({ key, label }) => (
            <ColorRow
              key={key}
              label={label}
              value={displayColors[key]}
              hint={key === "userBubble" && colors.userBubble === USER_BUBBLE_ACCENT ? "Follows accent" : undefined}
              onChange={(hex) => setCustomColor(key, hex)}
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
            {bgImage && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => setBgImage("")}
              >
                <X className="h-3 w-3" />
                Remove
              </Button>
            )}
          </div>
          {bgImage && (
            <div
              className="h-16 w-full rounded-lg border border-border bg-cover bg-center"
              style={{ backgroundImage: `url(${bgImage})` }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
