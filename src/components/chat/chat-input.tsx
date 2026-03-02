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
import { Plus, SendHorizontal, Globe, Paperclip, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type ChatInputSendPayload = {
  text: string
  files: File[]
}

const ACCEPTED_CHAT_ATTACHMENTS = "image/*,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.log,.html,.htm,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.hpp,.rs,.go,.sql,.sh,.ps1"

type ChatInputProps = {
  onSend: (payload: ChatInputSendPayload) => void
  isLoading?: boolean
  webSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  searchAvailable: boolean
}

export function ChatInput({ onSend, isLoading, webSearch, onWebSearchChange, searchAvailable }: ChatInputProps) {
  const [value, setValue] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [toolsOpen, setToolsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasInput = value.trim().length > 0 || files.length > 0

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if ((!trimmed && files.length === 0) || isLoading) return
    onSend({ text: trimmed, files })
    setValue("")
    setFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, files, isLoading, onSend])

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = event.target.files
    if (!incoming || incoming.length === 0) return

    const selectedFiles = Array.from(incoming)
    setFiles((current) => {
      const seen = new Set(current.map(file => `${file.name}-${file.size}-${file.lastModified}`))
      const next = [...current]

      for (const file of selectedFiles) {
        const key = `${file.name}-${file.size}-${file.lastModified}`
        if (!seen.has(key)) {
          seen.add(key)
          next.push(file)
        }
      }

      return next
    })

    event.target.value = ""
  }

  const handleRemoveFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
    setToolsOpen(false)
  }

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
    <div className="sticky bottom-0 z-20 shrink-0 px-4 pb-4 pt-2 safe-area-bottom bg-gradient-to-t from-background via-background/95 to-transparent backdrop-blur-sm">
      <div className="max-w-3xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPTED_CHAT_ATTACHMENTS}
          onChange={handleFilesSelected}
        />

        {files.length > 0 ? (
          <div className="mb-2 rounded-xl border border-border/50 bg-white/[0.02] p-2">
            <div className="flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <span
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-black/25 px-2 py-1 text-xs text-foreground/90"
                >
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">{file.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => handleRemoveFile(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-end overflow-hidden rounded-xl border border-border/50 bg-white/[0.03]">
          <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
                  toolsOpen && "text-foreground"
                )}
              >
                <Plus className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-3">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Tools</p>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={handleUploadClick}
                >
                  <span className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    Upload Files
                  </span>
                </button>
                {searchAvailable ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="web-search" className="cursor-pointer text-sm">Web Search</Label>
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

          <button
            type="button"
            onClick={handleUploadClick}
            disabled={isLoading}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors",
              isLoading ? "cursor-not-allowed opacity-50" : "hover:text-foreground"
            )}
            aria-label="Attach files"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Type a message..."
            rows={1}
            className="min-h-[44px] max-h-[200px] resize-none rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!hasInput || isLoading}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center transition-colors",
              hasInput && !isLoading
                ? "text-primary hover:text-primary/80"
                : "text-muted-foreground/30"
            )}
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>

        {webSearch && (
          <div className="ml-1 mt-1.5 flex items-center gap-1.5">
            <Globe className="h-3 w-3 text-primary" />
            <span className="text-[11px] text-primary">Web search enabled</span>
          </div>
        )}
      </div>
    </div>
  )
}
