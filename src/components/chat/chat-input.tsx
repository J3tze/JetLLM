"use client"

import { useState, useRef, useCallback } from "react"
import { Textarea } from "@/components/ui/textarea"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Plus, SendHorizontal, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

type ChatInputProps = {
  onSend: (text: string) => void
  isLoading?: boolean
  webSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  searchAvailable: boolean
}

export function ChatInput({ onSend, isLoading, webSearch, onWebSearchChange, searchAvailable }: ChatInputProps) {
  const [value, setValue] = useState("")
  const [toolsOpen, setToolsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, isLoading, onSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = "auto"
    target.style.height = `${target.scrollHeight}px`
  }

  return (
    <div className="px-4 pb-4 pt-2 safe-area-bottom">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end rounded-xl border border-border/50 bg-white/[0.03] overflow-hidden">
          {/* + button for tools popover */}
          <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center justify-center h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground transition-colors",
                  toolsOpen && "text-foreground"
                )}
              >
                <Plus className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-3">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Tools</p>
                {searchAvailable ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="web-search" className="text-sm cursor-pointer">Web Search</Label>
                    </div>
                    <Switch
                      id="web-search"
                      checked={webSearch}
                      onCheckedChange={onWebSearchChange}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Configure a Tavily API key in Settings &gt; Providers to enable web search.
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Type a message..."
            rows={1}
            className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!value.trim() || isLoading}
            className={cn(
              "flex items-center justify-center h-11 w-11 shrink-0 transition-colors",
              value.trim() && !isLoading
                ? "text-primary hover:text-primary/80"
                : "text-muted-foreground/30"
            )}
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>

        {/* Active tools indicator */}
        {webSearch && (
          <div className="flex items-center gap-1.5 mt-1.5 ml-1">
            <Globe className="h-3 w-3 text-primary" />
            <span className="text-[11px] text-primary">Web search enabled</span>
          </div>
        )}
      </div>
    </div>
  )
}
