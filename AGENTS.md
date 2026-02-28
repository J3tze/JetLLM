# AGENTS.md

This file provides guidance to coding agents working with this repository.

## Project Overview

JetLLM is a multi-provider LLM web UI with streaming chat, automatic memory, RAG, web search, code execution, and image generation. AMOLED-black themed with dynamic accent colors.

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript, strict mode)
- **LLM Integration:** Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, provider packages)
- **Database:** SQLite via Drizzle ORM + better-sqlite3 + sqlite-vec (stored at `./data/jetllm.db`, override with `DB_PATH` env var)
- **UI:** Tailwind CSS v4 + shadcn/ui (new-york style, lucide icons) + next-themes
- **Testing:** Vitest (node environment, `@` path alias configured)
- **Deployment:** Docker via multi-stage build (`Dockerfile`, `docker-compose.yml`); `output: "standalone"` in next.config; data volume at `/app/data`

## Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint (next/core-web-vitals + next/typescript)
npm test             # Run all tests (vitest)
npm test -- src/lib/__tests__/settings.test.ts   # Run a single test file
npm run test:watch   # Run tests in watch mode
npm run db:push      # Push schema directly to SQLite (dev)
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run pending migrations
npm run db:studio    # Launch Drizzle Studio GUI
npx shadcn@latest add <component>  # Add a new shadcn/ui component
docker compose build               # Build Docker image
docker compose up                   # Run in Docker (http://localhost:3000)
```

## Architecture

**Path alias:** `@` maps to `src/` (configured in both `tsconfig.json` and `vitest.config.mts`).

### API Routes (`src/app/api/`)
- `chat/` â€” POST streaming chat via Vercel AI SDK `streamText` â†’ `toUIMessageStreamResponse()`. Injects memories into system prompt, triggers background memory extraction in `onFinish`. `maxDuration = 60` seconds. Supports `webSearch` body param for always-search; also registers `web_search` tool via AI SDK `tool()` + `maxSteps: 3` when Tavily key is configured.
- `conversations/` â€” CRUD for conversations; `[id]/messages` for message history
- `memory/` â€” CRUD for memories; `[id]` for individual memory GET/PATCH/DELETE
- `providers/models/` â€” GET models list from OpenRouter (cached 1 hour)
- `projects/` â€” CRUD for projects; `[id]/documents` for file upload/delete
- `settings/` â€” GET public settings (provider keys filtered out; `search:tavilyKey` is exposed as boolean presence only), PUT key/value pairs. All route handlers wrapped in try/catch.
- `providers/configs/` â€” GET provider configs (returns `hasKey` boolean, never raw API keys), PUT to save provider API key/baseUrl

### Service Layer (`src/lib/`)
Services use a **factory pattern** for testability: `createSettingsService(db)`, `createConversationsService(db)`, and `createMemoryService(db)` accept a Drizzle db instance. Each also exports **convenience functions** (e.g., `getSetting`, `addMessage`, `createMemory`) that use the default db singleton from `getDb()`.

### Provider System (`src/lib/providers/`)
- `registry.ts` â€” `PROVIDER_REGISTRY` array defining 8 providers (OpenAI, Anthropic, Google, Mistral, Groq, OpenRouter, Together, Custom)
- `index.ts` â€” `getModel(providerId, modelId)` factory that reads API keys from settings (`provider:{id}` key) and returns a `LanguageModel` instance. Groq/OpenRouter/Together/Custom all use `createOpenAI` with custom base URLs.

### Memory System (`src/lib/memory/`, `src/lib/memory.ts`)
- `memory.ts` â€” Memory service (CRUD, case-insensitive `existsByContent` dedup via `COLLATE NOCASE`, `getFormattedForInjection` with `.limit(50)` for system prompt injection)
- `memory/prompts.ts` â€” Extraction prompt template with `buildExtractionPrompt(existingMemories, recentMessages)`
- `memory/extract.ts` â€” `extractMemories(conversationId)`: fire-and-forget background job using `generateText()` (temperature 0) with a configurable cheap/fast model. Uses last 10 messages as context. Parses JSON response (handles markdown-wrapped ```json blocks), deduplicates via `existsByContent`, stores new memories. Content capped at 200 chars (validation); only extracts `fact` and `preference` types.
- Memory types: `fact`, `preference`, `summary` (schema supports all three; extraction only produces `fact`/`preference`)
- Settings: `memory:enabled` (boolean), `memory:model` ({ provider, model })
- Injection: All memories formatted as bullet list, appended to system prompt (truncated at 2000 chars)

### Web Search (`src/lib/search/tavily.ts`)
- `searchWeb(query, limit?)` â€” Calls Tavily `/search` API, returns `{ title, url, content }[]`. Content truncated to 1000 chars per result, default 5 results, 10s timeout.
- `formatSearchResults(results)` â€” Formats results as markdown section for system prompt injection.
- API key stored as `search:tavilyKey` in settings.
- **Dual-mode:** Toggle ON (always-search) pre-fetches results into system prompt before `streamText()`. Toggle OFF lets the LLM call the `web_search` tool autonomously via Vercel AI SDK multi-step tool calling.
- **Status:** Tavily API key input in provider settings, tool invocation indicators in `message-list.tsx`, and `searchAvailable` detection in `ChatPanel` are implemented.

### Projects System (`src/lib/projects.ts`)
- Factory pattern: `createProjectsService(db)` with CRUD + `getConversations(projectId)` + `getStandaloneConversations()`
- Projects have: name, emoji icon, system prompt, attached documents
- Conversations optionally belong to a project via `projectId` FK

### RAG Pipeline (`src/lib/rag/`)
- `chunker.ts` â€” Splits text into ~500-token chunks with overlap. Strategy: paragraphs â†’ newlines â†’ sentences â†’ hard split.
- `embeddings.ts` â€” `embedSingle()` and `embedBatch()` using configurable `rag:model` setting via Vercel AI SDK `embed()`/`embedMany()`
- `process.ts` â€” `processDocument(id)`: fire-and-forget background job. Chunks text, batch-embeds, stores in sqlite-vec. Updates document status (processing â†’ ready/error).
- `search.ts` â€” `searchDocuments(projectId, query, topK)`: embeds query, sqlite-vec MATCH for top-K similar chunks, returns formatted context for system prompt injection.

### Database (`src/lib/db/`)
- `schema.ts` â€” Six tables: `conversations` (optional `projectId` FK), `messages` (FK cascade delete; has `toolCalls` and `metadata` text columns), `memories` (FK set null on conversation delete), `settings` (key-value), `projects`, `documents` (FK cascade delete on project). Additional raw SQL tables: `document_chunks` and `vec_chunks` (sqlite-vec virtual table) managed outside Drizzle schema.
- `index.ts` â€” `getDb()` singleton with WAL mode, foreign keys, and `busy_timeout = 5000` enabled. `getRawDb()` export for direct sqlite-vec access. `ensureTables()` auto-creates all tables (including sqlite-vec virtual table) via `CREATE TABLE IF NOT EXISTS` on first connection, and ensures hot-path indexes for pinned sorting, message retrieval, and memory lookup â€” no separate `db:push` needed in production/Docker.

### Frontend (`src/components/`, `src/hooks/`)
- `chat/chat-panel.tsx` â€” Main chat container. Manages provider/model state, `useChat` hook, auto-creates conversations on first message, persists user messages to DB before sending, supports retry/regenerate on the latest assistant turn, and uses request cancellation for settings/message loads. Top bar has only sidebar trigger + provider/model selectors (no parameter controls).
- `chat/chat-sidebar.tsx` - Split into Projects section (emoji + name, [+] create) and Chats section (standalone conversations). Supports create/select/pin/rename/delete actions for both sections, with confirmation dialog for delete and modal input for rename.
- `chat/model-selector.tsx` â€” Provider + model dropdowns. Switches to searchable combobox for providers with many models (OpenRouter). Falls back to text input when no default models.
- `chat/message-list.tsx` â€” Auto-scrolling message list with streaming support. Tracks viewport scroll position, pauses auto-scroll when user scrolls up, shows scroll-to-bottom button, renders web-search tool call indicators, and shows a retry action on the latest assistant message when applicable.
- `chat/chat-input.tsx` â€” Unified input bar: `+` button (left, opens tools Popover above with web search Switch toggle), auto-resizing Textarea (center), SendHorizontal button (right). All three inside one rounded-xl container. Shows "Web search enabled" accent indicator below bar when active. Props: `webSearch`, `onWebSearchChange`, `searchAvailable`.
- `chat/chat-message.tsx` â€” Message layout with 3 bubble styles (flat, minimal, full). Applies `--chat-font`, `--chat-text-color`, and per-role foreground CSS variables via inline styles.
- `chat/code-block.tsx` â€” Syntax-highlighted code blocks using Shiki (lazy-loaded, cached singleton highlighter). Header bar with language label + copy button. Fallback to plain `<pre>` while Shiki loads. Wired into ReactMarkdown via `components` override in `message-list.tsx`.
- `chat/parameter-popover.tsx` â€” Temperature, Max Tokens, Top P sliders (component exists but currently not rendered in the top bar).
- `components/jetllm-logo.tsx` â€” SVG logo with accent-colored origami plane and "LLM" text.
- `components/theme-initializer.tsx` â€” Loads accent color + chat theme from settings on mount. Applies CSS variables via JS on `documentElement`. Also creates a fixed-position wallpaper div (`#jetllm-wallpaper`) in the DOM with the background image + 40% dark scrim overlay.
- `hooks/use-accent-color.ts` â€” Manages accent color (7 presets). `applyAccent()` sets `--accent-color`, `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-ring`, `--chart-1` directly on `document.documentElement`.
- `hooks/use-chat-theme.ts` â€” Chat theme presets (AMOLED Black, Dark Gray, Midnight Blue) + individual color pickers. Manages `--chat-bg`, `--chat-user-bubble`, `--chat-assistant-bubble`, etc. Supports background image upload (data URL, max 2 MB), 8 font choices, 3 bubble styles (flat/minimal/full), glass opacity slider.
- `chat/project-home.tsx` â€” Project landing page with chat input, compact file chips, recent conversations, settings modal trigger.
- `chat/project-settings.tsx` â€” Dialog with name, emoji picker, system prompt textarea.
- `chat/emoji-picker.tsx` â€” Grid of ~80 emojis in a Popover.
- `hooks/use-conversations.ts` - Fetches, creates, renames, deletes, and pins conversations with optimistic updates and stable sorting.
- `hooks/use-memories.ts` â€” React hook for memory CRUD via `/api/memory`.
- `hooks/use-projects.ts` â€” Project CRUD hook via `/api/projects`, with optimistic pin/edit updates and stable sorting.
- `hooks/use-swipe-sidebar.ts` â€” Touch gesture for mobile sidebar open.

### Settings Page (`src/app/settings/page.tsx`)
Tabbed layout with three tabs:
- **General** â€” Chat settings (user name via `chat:userName`, system prompt via `chat:systemPrompt`), accent color picker, chat theme picker (presets, individual hex colors, background image, font selector, bubble style, glass opacity)
- **Providers** â€” API key configuration per provider (keys loaded/saved via `/api/providers/configs`, never exposed via public GET `/api/settings`) plus Tavily API key for web search
- **Memory** â€” Toggle, extraction model picker (same searchable dropdown as chat), embedding model picker for RAG (`rag:model` setting), stored memories list with add/edit/delete

### Chat Flow
1. User sends message â†’ `ChatPanel.handleSend()` auto-creates conversation if none exists
2. User message persisted to DB via POST `/api/conversations/[id]/messages`
3. `sendMessage()` triggers `DefaultChatTransport` â†’ POST `/api/chat` with `conversationId`, `provider`, `model`, `temperature`, `maxTokens`, `topP`, `webSearch`
4. Server resolves system prompt: global `chat:systemPrompt` setting > project-level systemPrompt > conversation-level systemPrompt > default `"You are a helpful AI assistant."`. Appends user name from `chat:userName` if set. Appends formatted memories if enabled. For project conversations, injects RAG document context (top-K similar chunks from sqlite-vec search) between memories and the user query.
5. `getModel(provider, modelId)` creates AI SDK model instance
6. Anthropic thinking models (`claude-sonnet-4*`, `claude-opus-4*`) on direct Anthropic provider get `providerOptions.anthropic.thinking` with `budgetTokens: 10000`; temperature/topP are skipped for these
7. If `webSearch` toggle ON and Tavily key configured, pre-fetch search results and append to system prompt
8. `streamText()` streams response with `sendReasoning: true` and `web_search` tool (when Tavily key exists, `maxSteps: 3`); `onFinish` persists assistant message to DB and triggers background memory extraction

### Theme & Accent Colors
- AMOLED dark: pure `#000000` background, surfaces at `oklch(0.075 0 0)`
- Dark mode forced by default via next-themes (`enableSystem={false}`)
- **Base theme colors use OKLch color space** in `globals.css` (e.g. `oklch(0.577 0.245 27.325)`). Accent-derived colors use HSL.
- Dynamic accent via `--accent-color` CSS variable (HSL format, e.g. `"220 90% 56%"`). Applied to all UI elements via JS (`applyAccent()` sets `--primary`, `--ring`, `--sidebar-*`, `--chart-1` directly on documentElement to bypass Tailwind v4 cascade issues).
- Chat theme colors (`--chat-bg`, `--chat-user-bubble`, `--chat-assistant-bubble`, etc.) customizable via presets or individual hex pickers. User bubble defaults to accent color via `"accent"` sentinel.
- **Minimal UI approach:** No avatars, no borders between header/content/input, transparent backgrounds. Three bubble styles selectable in settings (flat/minimal/full). The sidebar is solid black to blend with AMOLED edges.
- **Wallpaper system:** `ThemeInitializer` injects a fixed-position `#jetllm-wallpaper` div with `z-index: -1` behind all content. Background image stored as data URL in settings (`ui:chatTheme.bgImage`), rendered with a 40% dark scrim via `linear-gradient` overlay. URL values are quoted in CSS `url()` calls for safety. Default wallpaper shipped at `/public/default-wallpaper.jpg`. All UI layers above are transparent so the wallpaper shows through.
- `.glass-panel` and `.glass-control` utility classes in `globals.css` still available for components that need frosted glass effects.
- Custom dark variant: `@custom-variant dark (&:is(.dark *))` in globals.css.
- Safe area support: `.safe-area-top`/`.safe-area-bottom` classes for notched devices; root uses `height: 100dvh`.

## Key Conventions

- **All IDs use ULID format** (sortable, unique, via `ulid` package)
- **Timestamps:** Drizzle `integer` with `{ mode: "timestamp" }` â€” stored as unix epoch integers, returned as Date objects
- **Settings storage:** key-value in SQLite, JSON-serialized values. Provider configs use key `provider:{id}` (never exposed via public GET), UI settings use `ui:` prefix, memory settings use `memory:` prefix, chat settings use `chat:` prefix (`chat:userName`, `chat:systemPrompt`), search settings use `search:` prefix (`search:tavilyKey`). Public `/api/settings` returns `search:tavilyKey` as boolean presence, never the raw key.
- **Error handling:** All API routes wrap handlers in try/catch, return proper 400/404/500 status codes with JSON error bodies. `SyntaxError` from `request.json()` returns 400. Input validation on role enums, content length, type enums.
- **Streaming-first:** Chat API returns `toUIMessageStreamResponse()`, frontend uses `useChat` hook
- **Ref-based transport body:** `ChatPanel` uses refs (`stateRef`, `convIdRef`) so `DefaultChatTransport.body()` always reads the latest state values (avoids stale closures with memoized transport)
- **Hydration delay:** Page components return `null` until a `mounted` useState flips to `true`, preventing hydration mismatches from browser extensions
- **Default model:** Stored in settings under key `default-model` as `{ provider, model }`, auto-saved on selection change (500ms debounce)
- **Accent via JS, not CSS cascade:** All accent-derived CSS variables are set via `document.documentElement.style.setProperty()` in `applyAccent()` and `ThemeInitializer`, not via CSS `var()` references in `.dark` block (Tailwind v4 doesn't resolve nested `var()` in custom properties reliably)
- **Chat appearance CSS variables:** `--chat-font` (font family for messages), `--chat-text-color` (global text color), `--chat-user-bubble-fg`/`--chat-assistant-bubble-fg` (per-role text overrides). Bubble style communicated via `data-bubble-style` attribute on `documentElement`, synced to `ChatPanel` via `MutationObserver`.
- **Code block highlighting:** Shiki highlighter is lazily created as a module-level singleton promise. Languages loaded on demand. `github-dark-default` theme. `CodeBlock` component uses `not-prose` to escape Tailwind Typography.
- **Auto-titling:** After first assistant response, fire-and-forget LLM call generates 3-6 word title using `memory:model`. Runs in `onFinish` alongside memory extraction.

## Testing Patterns

Tests live in `__tests__/` directories adjacent to the code they test. All service tests use an in-memory SQLite database via a `createTestDb()` helper:

```typescript
function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle({ client: sqlite, schema })
  sqlite.exec(`CREATE TABLE ...`)  // raw SQL matching schema
  return { db, sqlite }
}
```

Provider, chat route, and memory extraction tests use `vi.mock` for external dependencies. Close the SQLite instance in `afterEach` to prevent resource leaks.

## Supported Providers

OpenAI, Anthropic, Google Gemini, Mistral, Groq, OpenRouter, Together AI, Custom OpenAI-compatible.

## PWA

Service worker at `/public/sw.js` uses network-first caching strategy (skips API calls). Precaches `/` and `/settings` on install. Manifest at `/public/manifest.json` with SVG icons. Registered via inline script in root layout.

## Development Expectations

- Keep visual changes consistent across desktop and mobile.
- For UI work, validate with screenshots (or Playwright) after changes.
- Prefer targeted lint/test commands for touched files first.
- Do not revert unrelated local changes.

## Docker

Multi-stage build: `deps` (Alpine + python3/make/g++ for better-sqlite3 native compilation) â†’ `builder` (npm run build) â†’ `runner` (minimal production image). `docker-compose.yml` maps a named volume `jetllm-data` to `/app/data` for SQLite persistence. Tables auto-created on first request via `ensureTables()`.

## Planning Docs

- Design doc: `docs/plans/2026-02-24-jetllm-design.md`
- MVP plan: `docs/plans/2026-02-24-jetllm-mvp-plan.md`
- Chat appearance: `docs/plans/2026-02-27-chat-appearance-design.md`
- Code blocks: `docs/plans/2026-02-27-code-blocks-design.md`
- Projects & RAG design: `docs/plans/2026-02-27-projects-rag-design.md`
- Projects & RAG plan: `docs/plans/2026-02-27-projects-rag-plan.md`
- Web search design: `docs/plans/2026-02-27-web-search-design.md`
- Web search plan: `docs/plans/2026-02-27-web-search-plan.md`

## Known Issues / Incomplete Work

- **Web search plan status:** Tasks 5-7 from `docs/plans/2026-02-27-web-search-plan.md` are now implemented in code (Tavily key UI, tool indicators, and `searchAvailable` detection). Keep the plan as historical context.
- **Stashed API optimizations:** `git stash list` contains "earlier optimization changes â€” api routes, db, memory" from a Codex session. These changes (provider key filtering in settings GET, Docker ensureTables, busy_timeout, error wrapping on all routes) caused the settings API to hang â€” likely a Turbopack compilation issue with the modified routes. Stash needs review before re-applying.

## Recent Updates (2026-02-28)

- Provider config persistence hardened:
  - `PUT /api/providers/configs` now merges with existing config.
  - Existing API key is preserved when incoming `apiKey` is missing, empty, or masked (`********`).
  - Added regression tests in `src/app/api/providers/configs/__tests__/route.test.ts`.
- RAG retrieval fixed for sqlite-vec:
  - `src/lib/rag/search.ts` now uses `AND k = ?` for vec0 KNN queries instead of `LIMIT ?`.
  - Added regression test in `src/lib/rag/__tests__/search.test.ts`.
- Chat defaults bootstrap hardened:
  - `GET /api/settings` now supports `?keys=...` to return only requested public settings.
  - `ChatPanel` loads `default-model`/`search:tavilyKey` via `?keys=...` and also checks `/api/providers/configs` to prefer a provider with a configured key.
  - Aborted settings fetches no longer fall back to OpenAI defaults.
- Project chat consistency hardening:
  - Conversation routes are marked `dynamic = "force-dynamic"` (`/api/conversations`, `/api/conversations/[id]`, `/api/conversations/[id]/messages`).
  - `ProjectHome` project docs/conversation fetches use `{ cache: "no-store" }`.
  - `ChatPanel` includes a rehydrate guard to reload DB messages when a selected conversation has zero local messages unexpectedly.
- Chat API error handling:
  - Missing provider API key now returns `400` with a concise error message instead of generic `500`.

