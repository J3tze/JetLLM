# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JetLLM is a multi-provider LLM web UI with streaming chat, automatic memory, RAG, web search, code execution, and image generation. AMOLED-black themed with dynamic accent colors.

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript, strict mode)
- **LLM Integration:** Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, provider packages)
- **Database:** SQLite via Drizzle ORM + better-sqlite3 (stored at `./data/jetllm.db`, override with `DB_PATH` env var)
- **UI:** Tailwind CSS v4 + shadcn/ui (new-york style, lucide icons) + next-themes
- **Testing:** Vitest (node environment, `@` path alias configured)
- **Deployment:** Docker (single container, data volume at `/app/data`)

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
```

## Architecture

**Path alias:** `@` maps to `src/` (configured in both `tsconfig.json` and `vitest.config.mts`).

### API Routes (`src/app/api/`)
- `chat/` — POST streaming chat via Vercel AI SDK `streamText` → `toUIMessageStreamResponse()`. Injects memories into system prompt, triggers background memory extraction in `onFinish`.
- `conversations/` — CRUD for conversations; `[id]/messages` for message history
- `memory/` — CRUD for memories; `[id]` for individual memory GET/PATCH/DELETE
- `providers/models/` — GET models list from OpenRouter (cached 1 hour)
- `settings/` — GET all settings, PUT key/value pairs

### Service Layer (`src/lib/`)
Services use a **factory pattern** for testability: `createSettingsService(db)`, `createConversationsService(db)`, and `createMemoryService(db)` accept a Drizzle db instance. Each also exports **convenience functions** (e.g., `getSetting`, `addMessage`, `createMemory`) that use the default db singleton from `getDb()`.

### Provider System (`src/lib/providers/`)
- `registry.ts` — `PROVIDER_REGISTRY` array defining 8 providers (OpenAI, Anthropic, Google, Mistral, Groq, OpenRouter, Together, Custom)
- `index.ts` — `getModel(providerId, modelId)` factory that reads API keys from settings (`provider:{id}` key) and returns a `LanguageModelV1` instance. Groq/OpenRouter/Together/Custom all use `createOpenAI` with custom base URLs.

### Memory System (`src/lib/memory/`, `src/lib/memory.ts`)
- `memory.ts` — Memory service (CRUD, `existsByContent` dedup, `getFormattedForInjection` for system prompt injection)
- `memory/prompts.ts` — Extraction prompt template with `buildExtractionPrompt(existingMemories, recentMessages)`
- `memory/extract.ts` — `extractMemories(conversationId)`: fire-and-forget background job using `generateText()` with a configurable cheap/fast model. Parses JSON response, deduplicates, stores new memories.
- Memory types: `fact`, `preference`, `summary`
- Settings: `memory:enabled` (boolean), `memory:model` ({ provider, model })
- Injection: All memories formatted as bullet list, appended to system prompt (truncated at 2000 chars)

### Database (`src/lib/db/`)
- `schema.ts` — Four tables: `conversations`, `messages` (FK cascade delete), `memories` (FK set null on conversation delete), `settings` (key-value)
- `index.ts` — `getDb()` singleton with WAL mode and foreign keys enabled

### Frontend (`src/components/`, `src/hooks/`)
- `chat/chat-panel.tsx` — Main chat container. Manages provider/model state, `useChat` hook, auto-creates conversations on first message, persists user messages to DB before sending.
- `chat/chat-sidebar.tsx` — Conversation list with create/delete/switch.
- `chat/model-selector.tsx` — Provider + model dropdowns. Switches to searchable combobox for providers with many models (OpenRouter). Falls back to text input when no default models.
- `chat/message-list.tsx` — Auto-scrolling message list with streaming support. Tracks viewport scroll position, pauses auto-scroll when user scrolls up, shows scroll-to-bottom button.
- `components/jetllm-logo.tsx` — SVG logo with accent-colored origami plane and "LLM" text.
- `components/theme-initializer.tsx` — Invisible component in root layout that loads accent color + chat theme from settings on mount and applies all CSS variables via JS (bypasses Tailwind v4 cascade issues).
- `hooks/use-accent-color.ts` — Manages accent color (7 presets). `applyAccent()` sets `--accent-color`, `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-ring`, `--chart-1` directly on `document.documentElement`.
- `hooks/use-chat-theme.ts` — Chat theme presets (AMOLED Black, Dark Gray, Midnight Blue) + individual color pickers. Manages `--chat-bg`, `--chat-user-bubble`, `--chat-assistant-bubble`, etc. Supports background image upload (data URL stored in settings).
- `hooks/use-conversations.ts` — Fetches, creates, deletes conversations.
- `hooks/use-memories.ts` — React hook for memory CRUD via `/api/memory`.

### Settings Page (`src/app/settings/page.tsx`)
Tabbed layout with three tabs:
- **General** — Accent color picker + chat theme picker (presets, individual hex colors, background image)
- **Providers** — API key configuration per provider
- **Memory** — Toggle, extraction model picker (same searchable dropdown as chat), stored memories list with add/edit/delete

### Chat Flow
1. User sends message → `ChatPanel.handleSend()` auto-creates conversation if none exists
2. User message persisted to DB via POST `/api/conversations/[id]/messages`
3. `sendMessage()` triggers `DefaultChatTransport` → POST `/api/chat` with `conversationId`, `provider`, `model`, `temperature`, `maxTokens`, `topP`
4. Server loads conversation system prompt (or default), appends formatted memories if enabled
5. `getModel(provider, modelId)` creates AI SDK model instance
6. Anthropic thinking models (`claude-sonnet-4*`, `claude-opus-4*`) on direct Anthropic provider get `providerOptions.anthropic.thinking` with `budgetTokens: 10000`; temperature/topP are skipped for these
7. `streamText()` streams response with `sendReasoning: true`; `onFinish` persists assistant message to DB and triggers background memory extraction

### Theme & Accent Colors
- AMOLED dark: pure `#000000` background, surfaces at `oklch(0.075 0 0)`
- Dark mode forced by default via next-themes (`enableSystem={false}`)
- Dynamic accent via `--accent-color` CSS variable (HSL format, e.g. `"220 90% 56%"`). Applied to all UI elements via JS (`applyAccent()` sets `--primary`, `--ring`, `--sidebar-*`, `--chart-1` directly on documentElement to bypass Tailwind v4 cascade issues).
- Chat theme colors (`--chat-bg`, `--chat-user-bubble`, `--chat-assistant-bubble`, etc.) customizable via presets or individual hex pickers. User bubble defaults to accent color via `"accent"` sentinel.
- Mild transparency effects: header/input bars use `bg-background/80 backdrop-blur-md`, assistant bubbles use `color-mix()` for translucency.
- Background image support via `--chat-bg-image` CSS variable (data URL stored in settings).

## Key Conventions

- **All IDs use ULID format** (sortable, unique, via `ulid` package)
- **Timestamps:** Drizzle `integer` with `{ mode: "timestamp" }` — stored as unix epoch integers, returned as Date objects
- **Settings storage:** key-value in SQLite, JSON-serialized values. Provider configs use key `provider:{id}`, UI settings use `ui:` prefix, memory settings use `memory:` prefix
- **Streaming-first:** Chat API returns `toUIMessageStreamResponse()`, frontend uses `useChat` hook
- **Ref-based transport body:** `ChatPanel` uses refs (`stateRef`, `convIdRef`) so `DefaultChatTransport.body()` always reads the latest state values (avoids stale closures with memoized transport)
- **Hydration delay:** Page components return `null` until a `mounted` useState flips to `true`, preventing hydration mismatches from browser extensions
- **Default model:** Stored in settings under key `default-model` as `{ provider, model }`, auto-saved on selection change (500ms debounce)
- **Accent via JS, not CSS cascade:** All accent-derived CSS variables are set via `document.documentElement.style.setProperty()` in `applyAccent()` and `ThemeInitializer`, not via CSS `var()` references in `.dark` block (Tailwind v4 doesn't resolve nested `var()` in custom properties reliably)

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

Provider, chat route, and memory extraction tests use `vi.mock` for external dependencies.

## Supported Providers

OpenAI, Anthropic, Google Gemini, Mistral, Groq, OpenRouter, Together AI, Custom OpenAI-compatible.

## Planning Docs

- Design doc: `docs/plans/2026-02-24-jetllm-design.md`
- MVP plan: `docs/plans/2026-02-24-jetllm-mvp-plan.md`
