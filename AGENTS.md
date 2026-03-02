# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Project Overview

JetLLM is a multi-provider LLM web UI with streaming chat, memory, RAG, web search, code execution, and image generation. The UI is AMOLED-first with customizable accents and chat appearance, and includes email/password authentication with cookie-based sessions.

## Tech Stack

- Framework: Next.js 16 (App Router, TypeScript, strict mode)
- LLM integration: Vercel AI SDK v6 (`ai`, `@ai-sdk/react`)
- Database: SQLite via Drizzle ORM + `better-sqlite3` + `sqlite-vec`
- UI: Tailwind CSS v4 + shadcn/ui + lucide icons + `next-themes`
- Testing: Vitest
- Deployment: Docker multi-stage build (Debian slim), `output: "standalone"`

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
npm test -- src/app/api/chat/__tests__/chat.test.ts
npm run db:push
npm run db:generate
npm run db:migrate
npm run db:studio
docker compose build
docker compose up
```

## Architecture

Path alias: `@` maps to `src/`.

### API Routes (`src/app/api`)

- `auth/signup`, `auth/login`, `auth/logout`, `auth/session`: password auth and session lifecycle.
- `chat`: streaming chat (`streamText` -> `toUIMessageStreamResponse()`), memory injection, optional always-search, tool-based web search, assistant persistence in `onFinish`.
- `conversations`: CRUD for conversations, plus `[id]/messages` (POST accepts `role`, `content`, and optional `toolCalls`/`metadata`).
- `projects`: CRUD for projects and `[id]/documents`.
- `memory`: memory CRUD.
- `settings`: key/value settings API (authenticated for writes; unauthenticated reads are limited to `ui:accentColor` and `ui:chatTheme` for login-page theming).
- `providers/configs`: provider API key/base URL config (never returns raw keys).
- `providers/models`: OpenRouter model listing (cached).

### Authentication (`src/lib/auth.ts`, `src/lib/auth-server.ts`)

- Passwords are stored as salted `scrypt` hashes.
- Session tokens are random 32-byte values; only SHA-256 token hashes are stored in DB.
- Cookie name: `jetllm_session` (HTTP-only, `SameSite=Lax`, secure in production).
- Session TTL: 30 days (`SESSION_TTL_SECONDS`).
- App pages (`/`, `/settings`) and core API routes require an authenticated session.

### Web Search (`src/lib/search/tavily.ts`)

- `searchWeb(query, limit?)` calls Tavily and returns normalized results.
- `formatSearchResults(results)` formats system-prompt context for always-search mode.
- `formatSearchToolSummary(results)` formats concise tool output for user-visible web-search summaries.
- Tavily key stored at `search:tavilyKey`.
- Status: key UI, `searchAvailable` detection, tool-call indicator rendering, and readable citation-style output are implemented.

### Frontend (`src/components`, `src/hooks`)

- `chat/chat-panel.tsx`: main container. Handles provider/model selection, loading persisted messages, sending, retry/regenerate, web-search toggle wiring, and file attachment send/persistence rules.
- `chat/chat-input.tsx`: input with tools popover. Includes web-search toggle and `Upload Files` action from the same `+` menu.
- `chat/message-list.tsx`: renders markdown, reasoning blocks, web-search indicators/results, user/assistant file parts (images inline, non-image files as chips), and retry action on latest assistant message.
- `chat/chat-sidebar.tsx`: projects/chats sidebar with create, select, pin, rename, and delete actions. Rename uses a dialog; delete uses confirmation.
- `hooks/use-conversations.ts`: fetch/create/rename/delete/pin conversations with optimistic updates and stable sorting.
- `hooks/use-projects.ts`: fetch/create/update/delete projects with optimistic updates and stable sorting.

### Persistence Notes

- `messages` table includes `content`, `tool_calls`, and `metadata`.
- Assistant tool outputs (for example `tool-web_search`) are persisted in `metadata.parts`.
- User text-document attachments are persisted in `metadata.parts` as `file` parts.
- User image attachments are intentionally non-persistent (used for model vision only in the live request).
- Conversation reload maps stored `metadata.parts` back into `UIMessage.parts`, so tool output survives refresh and chat switching.

### Docker Runtime Notes

- Container image uses `node:20-bookworm-slim` (glibc-based) to avoid musl/native-addon issues with `better-sqlite3` and `sqlite-vec`.
- Runtime process starts as root only for startup permission fix, then drops privileges to `nextjs` via `gosu` in `docker-entrypoint.sh`.
- Compose persists SQLite at `/app/data` and sets `DB_PATH=/app/data/jetllm.db`.
- `next/font/google` is not used; font CSS variables are defined locally in `src/app/globals.css` so image builds do not depend on Google Fonts network access.
- Next standalone tracing may miss optional platform packages for `sqlite-vec`; Dockerfile explicitly copies `sqlite-vec*` packages from deps into runner so vector search stays available in container.

## Chat Flow

1. User sends message from `ChatPanel`.
2. Optional attachments are converted to AI SDK `file` parts; only text-document file parts are included in persisted user metadata.
3. User message is persisted via `POST /api/conversations/[id]/messages`.
4. `useChat` sends request to `POST /api/chat` with transport body (`conversationId`, model/provider, params, `webSearch`) and optional `files`.
5. Server builds system prompt (global/project/conversation prompt, user name, memories, optional RAG, optional always-search context).
6. Server runs `streamText()` with optional `web_search` tool and model-specific options.
7. `onFinish` persists assistant response and persisted parts metadata, triggers memory extraction, and auto-title on first assistant turn.
8. For regenerate requests, latest assistant DB message is removed first to keep history linear.

## Key Conventions

- IDs: ULID.
- Settings: key-value JSON in SQLite (`provider:*`, `chat:*`, `memory:*`, `rag:*`, `search:*`, `ui:*`).
- Streaming-first architecture with `useChat`.
- Conversation/project lists sort pinned first, then latest `updatedAt`.
- Dark mode forced by default; accent and chat theme applied via CSS variables.

## Testing Patterns

- Keep tests near code in `__tests__`.
- Use in-memory SQLite for service tests.
- Mock external providers and APIs with `vi.mock`.
- Run targeted lint/tests on touched files before broad suites.

## Known Issues / Notes

- Review the old stash labeled around API/db/memory optimizations before reapplying; earlier attempts reportedly caused settings-route instability.
- Web search plan tasks are implemented; keep plan docs as historical references.
- `docker compose up` maps host `3000:3000`; if port 3000 is already used by local Node/Next, stop that process first or change the host port mapping.

## Recent Updates (2026-03-01)

- OpenAI-compatible providers (`groq`, `openrouter`, `together`, `custom`) must use chat model construction (`provider.chat(modelId)`) to avoid Responses API incompatibilities.
- `ModelSelector` provider-model loading now handles aborts safely: loading state is always reset on provider changes, and stale request completion is ignored.
- Fetch-once caching for provider model lists now marks a provider as fetched only after a successful response; aborted first loads can retry.
- In-chat file upload is implemented in the input tools popover. `useChat` sends file parts so models can analyze images and documents.
- Text-document uploads are persisted in user-message `metadata.parts`; image uploads are not persisted.
- Chat server message text extraction now includes text from uploaded text-document data URLs to improve context-dependent features.
- Browser tab favicon now uses a paper-plane icon that matches the JetLLM logo, colored to the Green accent preset (`#22c55e`) via `src/app/favicon.ico`.
- Added built-in auth routes and DB tables (`users`, `sessions`) with server-side route guards for app pages and main APIs.
- Added a dedicated `/login` page with a sleek AMOLED/glass UI for sign-in and account creation.
- Login supports a `Keep me logged in` checkbox:
  - Checked: persistent auth cookie (up to session expiry).
  - Unchecked: session cookie (cleared when browser session ends).
- Default accent preset is now Green (`#22c55e`, `142 71% 45%`), and login theming works without authentication via restricted `GET /api/settings` key access.
- Docker hardening:
  - Switched image base to Debian slim and added runtime ownership fix for `/app/data`.
  - Added explicit `sqlite-vec` platform package copy into runner image to keep RAG vector extension loading in standalone runtime.
  - Verified compose startup, API writes, and persisted SQLite files under containerized `/app/data`.

## Planning Docs

- `docs/plans/2026-02-24-jetllm-design.md`
- `docs/plans/2026-02-24-jetllm-mvp-plan.md`
- `docs/plans/2026-02-27-chat-appearance-design.md`
- `docs/plans/2026-02-27-code-blocks-design.md`
- `docs/plans/2026-02-27-projects-rag-design.md`
- `docs/plans/2026-02-27-projects-rag-plan.md`
- `docs/plans/2026-02-27-web-search-design.md`
- `docs/plans/2026-02-27-web-search-plan.md`
