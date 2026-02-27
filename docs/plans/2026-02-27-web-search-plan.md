# Web Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add web search via Firecrawl with a toggle in the chat input bar — ON = always search, OFF = LLM decides when to search.

**Architecture:** A Firecrawl search service (`src/lib/search/`) provides `searchWeb()`. The chat API route registers a `web_search` tool with `streamText()` so the LLM can search autonomously, and when the toggle is ON, pre-fetches results into the system prompt. The chat input bar is redesigned with an embedded + button (tools popover) and send button inside a unified container.

**Tech Stack:** Firecrawl API, Vercel AI SDK `tool()` + `maxSteps`, shadcn Popover + Switch

**Design Doc:** `docs/plans/2026-02-27-web-search-design.md`

---

## Task 1: Create Firecrawl Search Service

**Files:**
- Create: `src/lib/search/firecrawl.ts`

**Step 1: Create the search service**

Create `src/lib/search/firecrawl.ts`:

```typescript
import { getSetting } from "@/lib/settings"

export type SearchResult = {
  title: string
  url: string
  content: string
}

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search"
const MAX_CONTENT_LENGTH = 1000
const DEFAULT_LIMIT = 5
const TIMEOUT_MS = 10000

export async function searchWeb(query: string, limit: number = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const apiKey = getSetting<string>("search:firecrawlKey")
  if (!apiKey) {
    throw new Error("Firecrawl API key not configured")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error")
      throw new Error(`Firecrawl API error (${res.status}): ${errorText}`)
    }

    const data = await res.json()
    const results: SearchResult[] = (data.data || []).map((item: { title?: string; url?: string; markdown?: string }) => ({
      title: item.title || "Untitled",
      url: item.url || "",
      content: (item.markdown || "").slice(0, MAX_CONTENT_LENGTH),
    }))

    return results
  } finally {
    clearTimeout(timeout)
  }
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return ""

  const formatted = results.map(r =>
    `### [${r.title}](${r.url})\n${r.content}`
  ).join("\n\n")

  return `## Web Search Results\nThe following search results were retrieved for the user's query. Use these to inform your response. Cite sources when relevant.\n\n${formatted}`
}
```

**Step 2: Run lint**

Run: `npx eslint src/lib/search/firecrawl.ts`

**Step 3: Commit**

```bash
git add src/lib/search/firecrawl.ts
git commit -m "feat: create Firecrawl search service with searchWeb and formatSearchResults"
```

---

## Task 2: Add Web Search Tool to Chat Route

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Step 1: Add imports and web search body field**

At the top of `src/app/api/chat/route.ts`, add these imports:

```typescript
import { tool } from "ai"
import { z } from "zod"
import { searchWeb, formatSearchResults } from "@/lib/search/firecrawl"
import { getSetting } from "@/lib/settings"
```

Note: `getSetting` is already imported — just add `tool`, `z`, `searchWeb`, and `formatSearchResults`.

In the body destructuring (around line 23-39), add `webSearch`:

```typescript
const {
  messages,
  conversationId,
  provider,
  model: modelId,
  temperature,
  maxTokens: maxOutputTokens,
  topP,
  webSearch,
} = body as {
  messages: UIMessage[]
  conversationId?: string
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
  webSearch?: boolean
}
```

**Step 2: Add always-search pre-fetch**

After the memory injection block (after line 78) and before `const llmModel = getModel(...)`, add:

```typescript
// Web search: always-search mode — pre-fetch results into system prompt
const firecrawlKey = getSetting<string>("search:firecrawlKey")
if (webSearch && firecrawlKey) {
  const lastUserMessage = messages.filter(m => m.role === "user").pop()
  if (lastUserMessage) {
    const query = typeof lastUserMessage.content === "string"
      ? lastUserMessage.content
      : lastUserMessage.content.map(p => "text" in p ? p.text : "").join(" ")
    try {
      const results = await searchWeb(query.slice(0, 200))
      const searchContext = formatSearchResults(results)
      if (searchContext) {
        systemPrompt = systemPrompt + "\n\n" + searchContext
      }
    } catch (err) {
      console.error("[chat] Web search pre-fetch error:", err)
      // Continue without search results — don't block the response
    }
  }
}
```

**Step 3: Register the web_search tool**

In the `streamText()` call (around line 84), add the `tools` and `maxSteps` parameters. The tool should only be registered when the Firecrawl API key exists. Add these inside the `streamText({...})` object, after the `system` parameter:

```typescript
// Register web search tool when API key is configured
...(firecrawlKey ? {
  tools: {
    web_search: tool({
      description: "Search the web for current information. Use when the user asks about recent events, needs up-to-date data, or when your training data may be outdated.",
      parameters: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => {
        try {
          const results = await searchWeb(query)
          return results.map(r => `### ${r.title}\n${r.url}\n${r.content}`).join("\n\n")
        } catch (err) {
          return `Search failed: ${err instanceof Error ? err.message : "Unknown error"}`
        }
      },
    }),
  },
  maxSteps: 3,
} : {}),
```

**Important placement:** This spread goes AFTER `messages` and BEFORE the thinking/temperature spread. The full `streamText` call will look like:

```typescript
const result = streamText({
  model: llmModel,
  system: systemPrompt,
  messages: await convertToModelMessages(messages),
  // Web search tool (only when API key configured)
  ...(firecrawlKey ? {
    tools: {
      web_search: tool({ ... }),
    },
    maxSteps: 3,
  } : {}),
  // Thinking models don't support temperature/topP
  ...(thinking ? { ... } : { ... }),
  // Enable thinking for direct Anthropic provider
  ...(thinking && { ... }),
  onFinish: async ({ text }) => { ... },
})
```

**Step 4: Run lint**

Run: `npx eslint src/app/api/chat/route.ts`

**Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: add web search tool and always-search pre-fetch to chat route"
```

---

## Task 3: Redesign Chat Input with Unified Bar

**Files:**
- Modify: `src/components/chat/chat-input.tsx`

**Step 1: Rewrite ChatInput with unified container, + button, and embedded send**

Replace the entire content of `src/components/chat/chat-input.tsx`:

```tsx
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
                    Configure a Firecrawl API key in Settings &gt; Providers to enable web search.
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
```

Key changes from the current input:
- The `Textarea`, `+` button, and send button are all inside one `div` with `rounded-xl border`
- The `Textarea` has `border-0 bg-transparent rounded-none` to blend into the container
- The `+` button opens a `Popover` above with a Web Search toggle (`Switch` component)
- The send button is a plain `button` (not shadcn `Button`) to be flush with the container edge
- A small "Web search enabled" indicator appears below the bar when active
- New props: `webSearch`, `onWebSearchChange`, `searchAvailable`

**Step 2: Ensure Switch component exists**

Run: `ls src/components/ui/switch.tsx` — if it doesn't exist:
```bash
npx shadcn@latest add switch
```

**Step 3: Run lint**

Run: `npx eslint src/components/chat/chat-input.tsx`

**Step 4: Commit**

```bash
git add src/components/chat/chat-input.tsx
git commit -m "feat: redesign chat input with unified bar, tools popover, and web search toggle"
```

---

## Task 4: Wire WebSearch State Through ChatPanel

**Files:**
- Modify: `src/components/chat/chat-panel.tsx`

**Step 1: Add webSearch state and searchAvailable**

In `ChatPanel`, add these state variables (after `bubbleStyle`):

```typescript
const [webSearch, setWebSearch] = useState(false)
const [searchAvailable, setSearchAvailable] = useState(false)
```

**Step 2: Detect if Firecrawl key is configured**

In the existing settings-loading `useEffect` (the one that loads default model), add a check for the Firecrawl key. The settings GET already returns all non-provider keys. But `search:firecrawlKey` starts with `search:` not `provider:`, so it should be in the public response. Actually, we should treat it like provider keys and NOT expose it via GET. Instead, check via a dedicated lightweight mechanism.

Simplest approach: add to the same settings fetch — check if `search:firecrawlKey` exists (truthy).

```typescript
// Inside the .then() handler after loading defaults:
const hasFirecrawlKey = !!settings["search:firecrawlKey"]
setSearchAvailable(hasFirecrawlKey)
```

**Note:** The `search:firecrawlKey` will be in the settings response because the current GET `/api/settings` returns all settings. (The stashed optimization that filters `provider:` keys hasn't been applied yet.) If/when that filter is applied, `search:` keys would need to be either included or checked separately.

**Step 3: Add webSearch to stateRef and transport body**

Update the `stateRef` to include `webSearch`:

```typescript
const stateRef = useRef({ provider, model, temperature, maxTokens, topP, webSearch })
useEffect(() => {
  stateRef.current = { provider, model, temperature, maxTokens, topP, webSearch }
}, [provider, model, temperature, maxTokens, topP, webSearch])
```

The transport body already spreads `...stateRef.current`, so `webSearch` will automatically be included in the request body.

**Step 4: Pass props to ChatInput**

Update the `<ChatInput>` usage:

```tsx
<ChatInput
  onSend={handleSend}
  isLoading={isLoading}
  webSearch={webSearch}
  onWebSearchChange={setWebSearch}
  searchAvailable={searchAvailable}
/>
```

**Step 5: Run lint**

Run: `npx eslint src/components/chat/chat-panel.tsx`

**Step 6: Commit**

```bash
git add src/components/chat/chat-panel.tsx
git commit -m "feat: wire webSearch state and searchAvailable through ChatPanel"
```

---

## Task 5: Add Firecrawl API Key to Settings UI

**Files:**
- Modify: `src/components/settings/provider-settings.tsx`

**Step 1: Add a Web Search card to the providers settings**

At the bottom of `ProviderSettings` component's return JSX (after the existing provider cards), add a new card for Firecrawl:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">Web Search</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    <div className="space-y-1.5">
      <Label className="text-sm">Firecrawl API Key</Label>
      <div className="flex gap-2">
        <Input
          type={showKeys["firecrawl"] ? "text" : "password"}
          value={firecrawlKey}
          onChange={(e) => setFirecrawlKey(e.target.value)}
          placeholder="fc-..."
          className="font-mono text-xs"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowKeys(prev => ({ ...prev, firecrawl: !prev.firecrawl }))}
        >
          {showKeys["firecrawl"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Get your API key at firecrawl.dev. Enables web search in chat.
      </p>
    </div>
    <Button
      onClick={saveFirecrawlKey}
      disabled={saving}
      size="sm"
    >
      {saving ? "Saving..." : "Save"}
    </Button>
  </CardContent>
</Card>
```

**Step 2: Add firecrawlKey state and save function**

Add state for the key:

```typescript
const [firecrawlKey, setFirecrawlKey] = useState("")
```

Load it in the existing `useEffect` — after loading provider configs, also load the Firecrawl key:

```typescript
// Inside the useEffect, after provider config loading:
fetch("/api/settings")
  .then(res => res.ok ? res.json() : {})
  .then((settings: Record<string, unknown>) => {
    if (settings["search:firecrawlKey"]) {
      setFirecrawlKey("••••••••")
    }
  })
  .catch(() => {})
```

Add a save function:

```typescript
const saveFirecrawlKey = async () => {
  if (firecrawlKey === "••••••••") return // Don't save the placeholder
  setSaving(true)
  try {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "search:firecrawlKey", value: firecrawlKey }),
    })
    toast.success("Firecrawl API key saved")
  } catch {
    toast.error("Failed to save API key")
  } finally {
    setSaving(false)
  }
}
```

**Step 3: Run lint**

Run: `npx eslint src/components/settings/provider-settings.tsx`

**Step 4: Commit**

```bash
git add src/components/settings/provider-settings.tsx
git commit -m "feat: add Firecrawl API key configuration to settings"
```

---

## Task 6: Render Tool Call Indicators in Messages

**Files:**
- Modify: `src/components/chat/message-list.tsx`

**Step 1: Add tool-invocation rendering**

In `message-list.tsx`, inside the `message.parts.map()` block, add a handler for `tool-invocation` parts (after the `reasoning` and `text` handlers):

```tsx
if (part.type === "tool-invocation") {
  const toolPart = part as { type: "tool-invocation"; toolInvocation: { toolName: string; state: string; args?: Record<string, unknown> } }
  if (toolPart.toolInvocation.toolName === "web_search") {
    return (
      <div key={i} className="mb-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" />
          {toolPart.toolInvocation.state === "result"
            ? `Searched the web for "${toolPart.toolInvocation.args?.query || ""}"`
            : "Searching the web..."}
        </div>
      </div>
    )
  }
  return null
}
```

**Step 2: Add Globe import**

Add to the imports at the top:

```typescript
import { ChevronDown, Globe } from "lucide-react"
```

**Step 3: Run lint**

Run: `npx eslint src/components/chat/message-list.tsx`

**Step 4: Commit**

```bash
git add src/components/chat/message-list.tsx
git commit -m "feat: render web search tool call indicator in messages"
```

---

## Task 7: Visual Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Configure Firecrawl key**

1. Go to Settings > Providers
2. Scroll to the Web Search card
3. Enter a Firecrawl API key and save

**Step 3: Test the unified input bar**

1. Go to chat — verify the input bar has the + button on the left and send button on the right, all in one container
2. Click + — verify the tools popover appears above with a Web Search toggle
3. Toggle web search ON — verify "Web search enabled" indicator appears below the bar

**Step 4: Test always-search mode (toggle ON)**

1. Enable web search toggle
2. Send "What happened in the news today?"
3. Verify the response includes current information from search results
4. Verify the response cites sources

**Step 5: Test LLM-decides mode (toggle OFF)**

1. Disable web search toggle
2. Send "What is the current stock price of NVIDIA?"
3. The LLM should call the web_search tool autonomously (visible as "Searching the web..." indicator)
4. Send "What is 2+2?" — the LLM should NOT search (no need)

**Step 6: Test error cases**

1. Remove the Firecrawl API key from settings
2. Verify the toggle shows "Configure a Firecrawl API key..." message instead of the switch
3. Verify chat still works normally without search

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: web search with Firecrawl — dual-mode toggle and redesigned input bar"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Firecrawl search service | `src/lib/search/firecrawl.ts` |
| 2 | Web search tool in chat route | `src/app/api/chat/route.ts` |
| 3 | Redesign chat input with unified bar | `src/components/chat/chat-input.tsx` |
| 4 | Wire webSearch state through ChatPanel | `src/components/chat/chat-panel.tsx` |
| 5 | Firecrawl API key in settings | `src/components/settings/provider-settings.tsx` |
| 6 | Tool call indicator rendering | `src/components/chat/message-list.tsx` |
| 7 | Visual verification | Manual testing |

**Total: 7 tasks**
