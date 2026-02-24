# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JetLLM is a multi-provider LLM web UI with streaming chat, automatic memory, RAG, web search, code execution, and image generation. AMOLED-black themed with dynamic accent colors.

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript, strict mode)
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
npx shadcn@latest add <component>  # Add a new shadcn/ui component
```

## Architecture

**Path alias:** `@` maps to `src/` (configured in both `tsconfig.json` and `vitest.config.mts`).

### API Routes (`src/app/api/`)
- `chat/` — POST streaming chat via Vercel AI SDK `streamText` → `toUIMessageStreamResponse()`
- `conversations/` — CRUD for conversations; `[id]/messages` for message history
- `settings/` — GET all settings, PUT key/value pairs

### Service Layer (`src/lib/`)
Services use a **factory pattern** for testability: `createSettingsService(db)` and `createConversationsService(db)` accept a Drizzle db instance. Each also exports **convenience functions** (e.g., `getSetting`, `addMessage`) that use the default db singleton from `getDb()`.

### Provider System (`src/lib/providers/`)
- `registry.ts` — `PROVIDER_REGISTRY` array defining 8 providers (OpenAI, Anthropic, Google, Mistral, Groq, OpenRouter, Together, Custom)
- `index.ts` — `getModel(providerId, modelId)` factory that reads API keys from settings (`provider:{id}` key) and returns a `LanguageModelV1` instance. Groq/OpenRouter/Together/Custom all use `createOpenAI` with custom base URLs.

### Database (`src/lib/db/`)
- `schema.ts` — Three tables: `conversations`, `messages` (FK cascade delete), `settings` (key-value)
- `index.ts` — `getDb()` singleton with WAL mode and foreign keys enabled

### Chat Flow
1. Frontend `useChat` hook → POST `/api/chat` with `conversationId`, `provider`, `model`
2. Server loads conversation system prompt (or default)
3. `getModel(provider, modelId)` creates AI SDK model instance
4. `streamText()` streams response; `onFinish` persists assistant message to DB

### Theme
- AMOLED dark: pure `#000000` background (`oklch(0 0 0)`), surfaces at `oklch(0.075 0 0)`
- Dark mode forced by default via next-themes (`enableSystem={false}`)
- Accent colors via CSS custom properties in `globals.css`

## Key Conventions

- **All IDs use ULID format** (sortable, unique, via `ulid` package)
- **Timestamps:** Drizzle `integer` with `{ mode: "timestamp" }` — stored as unix epoch integers, returned as Date objects
- **Settings storage:** key-value in SQLite, JSON-serialized values. Provider configs use key `provider:{id}`
- **Streaming-first:** Chat API returns `toUIMessageStreamResponse()`, frontend uses `useChat` hook

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

Provider and chat route tests use `vi.mock` for external dependencies.

## Supported Providers

OpenAI, Anthropic, Google Gemini, Mistral, Groq, OpenRouter, Together AI, Custom OpenAI-compatible.

## Planning Docs

- Design doc: `docs/plans/2026-02-24-jetllm-design.md`
- MVP plan: `docs/plans/2026-02-24-jetllm-mvp-plan.md`
