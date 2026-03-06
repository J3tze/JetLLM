# Codebase Optimization Plan

**Goal:** Reduce avoidable work in the JetLLM request/render path before adding more features, with emphasis on chat latency, payload size, repeated settings/config fetches, and expensive client-side rendering.

**Scope:** Server-side settings/provider access, chat request assembly, document list payloads, client-side settings/bootstrap flows, attachment handling, and chat message rendering.

**Priority:** Start with changes that reduce repeated reads and large payloads without changing product behavior.

---

## Task 1: Batch Settings and Provider Config Reads on the Server

**Why:** The app repeatedly reads individual settings keys in hot paths, especially chat and provider/model setup.

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/providers/configs/route.ts`
- Modify: `src/lib/providers/index.ts`
- Modify: `src/lib/search/tavily.ts`

**Plan:**
- Add a batched settings helper to fetch only requested keys instead of loading the whole settings table.
- Update `/api/settings` to use requested keys when present rather than always calling `getAllSettings()`.
- Add a batched provider-config helper so provider summaries do not loop over `getSetting()` once per provider.
- Build a request-scoped chat config object in `/api/chat` so system prompt, memory, RAG, Tavily, and provider config are loaded once.
- Pass loaded config into helpers where practical instead of re-reading from `getSetting()`.

**Expected outcome:**
- Fewer SQLite reads per chat request.
- Fewer repeated config reads in `/api/settings` and `/api/providers/configs`.
- Less duplicated config lookups across server helpers.
- Cleaner boundaries between route logic and config access.

---

## Task 2a: Consolidate Client Settings and Provider Summary Bootstrap

**Why:** The client fetches the same settings/provider data in multiple places during startup and in Settings screens.

**Files:**
- Modify: `src/components/theme-initializer.tsx`
- Modify: `src/hooks/use-accent-color.ts`
- Modify: `src/hooks/use-chat-theme.ts`
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `src/components/settings/chat-settings.tsx`
- Modify: `src/components/settings/provider-settings.tsx`
- Modify: `src/components/settings/memory-settings.tsx`
- Modify: `src/components/settings/rag-settings.tsx`
- Create: shared client settings/provider hook if needed

**Plan:**
- Introduce a shared client cache or hook for settings and provider config summaries.
- Remove duplicate startup fetches for accent/chat theme that overlap with `ThemeInitializer`.
- Reuse one provider-config source for chat, memory settings, RAG settings, and provider settings.

**Expected outcome:**
- Fewer redundant HTTP requests on load.
- Less repeated state logic in settings components.
- More predictable initialization behavior.

---

## Task 2b: Unify Provider Model List Caching

**Why:** Provider model lists are fetched in multiple client components with near-identical state and caching logic.

**Files:**
- Modify: `src/components/chat/model-selector.tsx`
- Modify: `src/components/settings/memory-settings.tsx`
- Modify: `src/components/settings/rag-settings.tsx`
- Create: shared provider-model hook/cache if needed

**Plan:**
- Introduce a shared provider-model cache or hook that deduplicates concurrent requests by provider.
- Reuse one abort-safe loading flow across chat, memory settings, and RAG settings.
- Mark a provider as fetched only after a successful response so aborted/failed first loads can retry.

**Expected outcome:**
- Fewer duplicate `/api/providers/models` requests.
- Less repeated model-loading state logic.
- More consistent model picker behavior across the app.

---

## Task 3: Trim Project Document List Payloads

**Why:** Project document listing returns full document `content`, but list views only need metadata.

**Files:**
- Modify: `src/app/api/projects/[id]/documents/route.ts`
- Modify: `src/components/chat/project-home.tsx`
- Modify: `src/lib/db/schema.ts` only if a separate summary field becomes necessary

**Plan:**
- Change project document list responses to return metadata only: `id`, `name`, `status`, `chunkCount`, and timestamps.
- Keep full content available only for document processing and detail operations.
- Verify project home UI only depends on summary fields.

**Expected outcome:**
- Smaller JSON responses.
- Faster project home loading as document counts grow.
- Less risk of pushing large blobs through React state unnecessarily.

---

## Task 4: Memoize Chat Message Rendering

**Why:** Streaming updates currently cause expensive markdown and code rendering work across the visible message list.

**Files:**
- Modify: `src/components/chat/message-list.tsx`
- Modify: `src/components/chat/chat-message.tsx`
- Modify: `src/components/chat/code-block.tsx`

**Plan:**
- Split stable message rows from the actively streaming tail.
- Memoize rendered message items so old messages do not re-render on each token.
- Add a cache for highlighted code HTML keyed by `language + code`.
- Keep auto-scroll logic tied to the streaming message instead of recomputing over the full list where possible.

**Expected outcome:**
- Lower CPU usage during long responses.
- Smoother scrolling in conversations with markdown/code.
- Less repeated Shiki work for unchanged blocks.

---

## Task 5: Remove Unnecessary Client-Only Blank First Paint

**Why:** Some top-level shells return `null` until mounted, which delays visible UI and is broader than the actual hydration-sensitive logic.

**Files:**
- Modify: `src/components/app/main-shell.tsx`
- Modify: `src/components/settings/settings-layout-shell.tsx`

**Plan:**
- Remove mount gates that blank the whole shell.
- Isolate only the DOM-sensitive behavior behind client-only guards.
- Preserve the original Dark Reader / extension workaround only where needed.

**Expected outcome:**
- Faster first paint.
- Less layout popping on initial load.
- Better SSR value from the existing App Router setup.

---

## Task 6: Tighten Service-Layer DB Round Trips

**Why:** Several service methods insert/update rows and immediately re-select them, or perform related writes outside transactions.

**Files:**
- Modify: `src/lib/conversations.ts`
- Modify: `src/lib/projects.ts`
- Modify: `src/lib/memory.ts`
- Modify: `src/lib/auth.ts`

**Plan:**
- Return constructed objects directly after inserts where a follow-up read is unnecessary.
- Wrap multi-step writes such as message insert + conversation timestamp update in transactions.
- Prioritize the concrete hotspots first: create/insert helpers and conversation message write paths.

**Expected outcome:**
- Fewer DB round trips.
- More consistent write behavior.
- Better foundation for future scale without changing the storage layer.

---

## Task 7: Phase Chat Attachment Transport Work

**Why:** Chat attachments are eagerly converted to data URLs in the browser and, with the current AI SDK message transport, payload-size reduction will require a deliberate transport redesign rather than a small refactor.

**Files:**
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `src/components/chat/chat-input.tsx`
- Modify: `src/app/api/chat/route.ts`

**Plan:**
- Add explicit size/count guardrails for chat attachments on the client and server.
- Extract server-side text attachment content once and reuse it for persistence and prompt assembly.
- Keep image attachments non-persistent and preserve current user-visible behavior.
- Treat actual payload-size reduction as a follow-up transport design task (for example multipart or hosted-file flow) instead of folding it into the first optimization pass.

**Expected outcome:**
- Immediate protection against oversized chat requests.
- Less duplicate parsing work on the server.
- A clearer path to future payload-size reductions without hidden scope creep.

---

## Suggested Execution Order

1. Batch settings and provider config reads on the server.
2. Consolidate client settings and provider summary bootstrap.
3. Unify provider model list caching.
4. Trim project document list payloads.
5. Memoize chat message rendering.
6. Remove unnecessary mount-only blank renders.
7. Tighten service-layer DB round trips.
8. Phase chat attachment transport work, starting with guardrails.

---

## Validation

For each optimization task:

1. Run targeted lint/tests on touched files first.
2. Re-run `npm run lint`.
3. Re-run `npm run build`.
4. For chat-path changes, manually verify:
   - normal chat send/stream
   - regenerate
   - project chat with RAG
   - web search on/off
   - file attachment send and reload behavior
