# Web Search Design

**Date:** 2026-02-27
**Scope:** Web search via Firecrawl with always-search toggle and LLM-autonomous tool use.

---

## Overview

Add web search capability using Firecrawl as the backend. Two modes controlled by a toggle in the chat input bar:

- **Toggle OFF (default):** A `web_search` tool is registered with `streamText()`. The LLM decides when to call it based on the user's query. Multi-step tool calls enabled via `maxSteps`.
- **Toggle ON ("Always Search"):** Before calling `streamText()`, the server pre-fetches search results for the user's last message and injects them into the system prompt as context. The tool remains available for follow-up searches.

## Search Backend

### Firecrawl (`src/lib/search/firecrawl.ts`)

Uses Firecrawl's `/search` endpoint which performs a Google search and auto-scrapes/extracts content from top results, returning clean markdown.

```typescript
type SearchResult = {
  title: string
  url: string
  content: string  // extracted markdown from the page
}

async function searchWeb(query: string, limit?: number): Promise<SearchResult[]>
```

- API key stored in settings as `search:firecrawlKey`
- Default limit: 5 results
- Content per result truncated to ~1000 chars to avoid blowing up the context window
- Total injected search context capped at ~3000 tokens

## Chat Route Changes (`src/app/api/chat/route.ts`)

### New request body field
```typescript
webSearch?: boolean  // true = always search, false/undefined = LLM decides
```

### Always-search mode (toggle ON)
Before `streamText()`:
1. Extract last user message text
2. Call `searchWeb(lastMessage)`
3. Format results as a system prompt section:
   ```
   ## Web Search Results
   The following search results were retrieved for the user's query:

   ### [Title](url)
   [content excerpt]

   ### [Title](url)
   [content excerpt]
   ...

   Use these results to inform your response. Cite sources when relevant.
   ```
4. Append to system prompt (after memories, before the LLM call)

### Tool mode (always available)
Register a `web_search` tool with `streamText()`:
```typescript
tools: {
  web_search: tool({
    description: "Search the web for current information. Use when the user asks about recent events, needs up-to-date data, or when your training data may be outdated.",
    parameters: z.object({
      query: z.string().describe("The search query"),
    }),
    execute: async ({ query }) => {
      const results = await searchWeb(query)
      return results.map(r => `### ${r.title}\n${r.url}\n${r.content}`).join("\n\n")
    },
  }),
},
maxSteps: 3,  // allow up to 3 tool call rounds
```

The tool is registered regardless of the toggle state so the LLM can always do follow-up searches.

## Chat Input Redesign (`src/components/chat/chat-input.tsx`)

### Unified input bar
The textarea, + button, and send button are all part of one cohesive rounded container:

```
┌─[+]──────────────────────────────────[▶]─┐
│  Type a message...                        │
└───────────────────────────────────────────┘
```

- **+ button** (left): Opens a popover menu above the input bar with tool toggles
- **Send button** (right): Embedded into the bar's right edge, accent-colored
- Both buttons are inside the same border/background container as the textarea

### Tools popover
A small popover (using shadcn Popover) that appears above the + button:
- **Web Search** toggle — globe icon + label + switch/toggle
- Future tools go here (code execution, image gen, etc.)
- Popover closes on outside click

### State flow
`webSearch` state lives in `ChatInput`, passed to `ChatPanel` via the `onSend` callback (or a separate prop). `ChatPanel` includes it in the transport body so the server knows the toggle state.

Alternative: `webSearch` state lives in `ChatPanel` and is passed down to `ChatInput` as a prop + setter. This is cleaner since `ChatPanel` already manages the transport body via refs.

## Settings

### Firecrawl API Key
Added to the **Providers** tab in settings (since it's an external API key, same pattern as LLM providers).

- Setting key: `search:firecrawlKey`
- UI: text input with "Firecrawl API Key" label in a new "Web Search" card on the Providers tab
- The web search tool is only registered when the API key is configured (graceful degradation — no key = no search capability, toggle hidden)

## Frontend Display

When the LLM uses the web_search tool, the Vercel AI SDK streams tool call parts. In `message-list.tsx`, tool call parts can be rendered as a collapsible "Searched the web" indicator (similar to the existing reasoning block). The actual search results don't need separate rendering — the LLM synthesizes them into its response text.

## Error Handling

- Firecrawl API errors: catch and return a descriptive error string as the tool result so the LLM can tell the user "I couldn't search right now"
- Missing API key: tool not registered, toggle hidden in UI
- Rate limits: Firecrawl returns 429 — surface as tool error, LLM responds without search
- Network timeout: 10 second timeout on Firecrawl calls
