"use client"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useState } from "react"

const EMOJI_GRID = [
  "\u{1F4C1}", "\u{1F680}", "\u{1F4A1}", "\u{1F3AF}", "\u{1F4DA}", "\u{1F527}", "\u{1F4BB}", "\u{1F3A8}", "\u{1F30D}", "\u{1F4DD}",
  "\u2B50", "\u{1F525}", "\u{1F48E}", "\u{1F3AE}", "\u{1F3B5}", "\u{1F4F8}", "\u{1F3E0}", "\u{1F697}", "\u2708\uFE0F", "\u{1F338}",
  "\u{1F373}", "\u2615", "\u{1F382}", "\u{1F355}", "\u{1F3CB}\uFE0F", "\u26BD", "\u{1F3B2}", "\u{1F0CF}", "\u{1F9E9}", "\u{1F52C}",
  "\u{1F4CA}", "\u{1F4C8}", "\u{1F5C2}\uFE0F", "\u{1F4CB}", "\u2705", "\u2764\uFE0F", "\u{1F49C}", "\u{1F499}", "\u{1F49A}", "\u{1F49B}",
  "\u{1F431}", "\u{1F436}", "\u{1F98A}", "\u{1F43C}", "\u{1F981}", "\u{1F438}", "\u{1F98B}", "\u{1F308}", "\u2600\uFE0F", "\u{1F319}",
  "\u{1F4B0}", "\u{1F381}", "\u{1F3C6}", "\u{1F451}", "\u{1F4A1}", "\u{1F511}", "\u{1F6E1}\uFE0F", "\u26A1", "\u{1F310}", "\u{1F52E}",
  "\u{1F4F1}", "\u{1F5A5}\uFE0F", "\u2328\uFE0F", "\u{1F5B1}\uFE0F", "\u{1F4BE}", "\u{1F4E1}", "\u{1F50B}", "\u{1F4BF}", "\u{1F3A7}", "\u{1F3A4}",
  "\u270F\uFE0F", "\u{1F4D0}", "\u{1F4CF}", "\u{1F58A}\uFE0F", "\u{1F4CC}", "\u{1F5D1}\uFE0F", "\u{1F4CE}", "\u2702\uFE0F", "\u{1F50D}", "\u{1F512}",
]

type EmojiPickerProps = {
  value: string
  onSelect: (emoji: string) => void
  children: React.ReactNode
}

export function EmojiPicker({ value, onSelect, children }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-10 gap-1">
          {EMOJI_GRID.map((emoji, i) => (
            <button
              key={i}
              onClick={() => {
                onSelect(emoji)
                setOpen(false)
              }}
              className="flex items-center justify-center h-8 w-8 rounded hover:bg-white/10 transition-colors text-lg"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
