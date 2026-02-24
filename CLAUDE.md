# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JetLLM is a multi-provider LLM web UI with streaming chat, automatic memory, RAG, web search, code execution, and image generation. AMOLED-black themed with dynamic accent colors.

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **LLM Integration:** Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, provider packages)
- **Database:** SQLite via Drizzle ORM + better-sqlite3
- **Vector Search:** sqlite-vec (RAG embeddings, not yet implemented)
- **UI:** Tailwind CSS v4 + shadcn/ui + next-themes
- **Testing:** Vitest (with in-memory SQLite for service tests)
- **Deployment:** Docker (single container, data volume at `/app/data`)

## Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm test             # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
npm test -- src/lib/__tests__/settings.test.ts  # Run a single test file
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run pending migrations
npm run db:push      # Push schema directly to SQLite
npm run db:studio    # Open Drizzle Studio GUI
```

## Architecture

```
src/
├── app/                     # Next.js App Router
│   ├── api/
│   │   ├── chat/            # POST — streaming chat via Vercel AI SDK
│   │   ├── conversations/   # GET/POST list/create, [id] GET/PATCH/DELETE, [id]/messages GET
│   │   └── settings/        # GET all, PUT key/value
│   ├── layout.tsx           # Root layout (ThemeProvider + TooltipProvider + Toaster)
│   ├── page.tsx             # Home page (placeholder, will become chat UI)
│   └── globals.css          # AMOLED theme variables + Tailwind
├── components/
│   ├── theme-provider.tsx   # next-themes wrapper
│   └── ui/                  # shadcn/ui components (21 components)
├── lib/
│   ├── db/
│   │   ├── schema.ts        # Drizzle schema: conversations, messages, settings
│   │   └── index.ts         # DB singleton (getDb) with WAL + foreign keys
│   ├── providers/
│   │   ├── registry.ts      # PROVIDER_REGISTRY — 8 providers with metadata
│   │   └── index.ts         # getModel(providerId, modelId) factory
│   ├── conversations.ts     # createConversationsService(db) + convenience wrappers
│   └── settings.ts          # createSettingsService(db) + convenience wrappers
└── hooks/
    └── use-mobile.ts        # Mobile detection hook (from shadcn)
```

## Testing Patterns

Services use a **factory pattern** for testability: `createSettingsService(db)` and `createConversationsService(db)` accept a Drizzle db instance, allowing tests to pass an in-memory SQLite database.

Test helper pattern used across all test files:
```typescript
function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle({ client: sqlite, schema })
  sqlite.exec(`CREATE TABLE ...`)  // raw SQL for in-memory
  return { db, sqlite }
}
```

Provider and chat route tests use `vi.mock` for external dependencies.

## Key Design Decisions

- **All IDs use ULID format** (sortable, unique, via `ulid` package)
- **Timestamps use Drizzle `{ mode: "timestamp" }`** — stored as integers, returned as Date objects
- **Settings stored as key-value** in SQLite (`settings` table, JSON-serialized values)
- **Provider configs** stored with key `provider:{id}` (e.g., `provider:openai`)
- **Streaming-first:** Chat uses Vercel AI SDK `useChat` hook; API returns via `toUIMessageStreamResponse()`
- **Single Docker container:** No external databases; SQLite for everything
- **Factory + convenience pattern:** Services export both `createXService(db)` (testable) and standalone functions (use default db singleton)

## Chat Flow

1. Frontend `useChat` hook sends message to `/api/chat` with conversationId, model, provider
2. Server loads conversation system prompt (or uses default)
3. `getModel(provider, modelId)` creates the AI SDK model instance
4. `streamText()` streams response from chosen provider
5. `onFinish` callback persists assistant message to DB

## Supported Providers

OpenAI, Anthropic, Google Gemini, Mistral (native SDK), Groq, OpenRouter, Together AI, Custom OpenAI-compatible (via `createOpenAI` with custom baseURL).

## Theme System

- **AMOLED base:** pure `#000000` background via `oklch(0 0 0)`, surfaces at `oklch(0.075 0 0)`
- **Accent colors** via CSS custom properties in `globals.css`
- Theme managed by `next-themes`, dark mode forced by default

## Implementation Progress

- **Tasks 1-6 complete:** Scaffold, DB, settings, providers, conversations, chat streaming
- **Tasks 7-14 remaining:** Chat UI (sidebar, messages, input), settings page, theme system, Docker
- **Design doc:** `docs/plans/2026-02-24-jetllm-design.md`
- **MVP plan:** `docs/plans/2026-02-24-jetllm-mvp-plan.md`
