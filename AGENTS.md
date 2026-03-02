# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Update rule (1 minute)
When you finish a unit of work (fix, refactor, investigation, decision):
- Add 1 bullet under **Today / Recent**
- Include: what changed, where, and why
- If you didn’t change code, still log the conclusion

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
- Startup permission fix is targeted to `DB_PATH` and SQLite sidecar files (`-wal`, `-shm`) to avoid recursive `chown` on every boot.
- Compose persists SQLite at `/app/data` and sets `DB_PATH=/app/data/jetllm.db`.
- `next/font/google` is not used; font CSS variables are defined locally in `src/app/globals.css` so image builds do not depend on Google Fonts network access.
- Next standalone tracing may miss optional platform packages for `sqlite-vec`; Dockerfile explicitly copies `sqlite-vec` plus `sqlite-vec-linux-*` packages from deps into runner so vector search stays available in container.
- Dockerfile uses BuildKit cache mount for `npm ci` (`--mount=type=cache,target=/root/.npm`) to speed up repeat image builds.

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

## Recent Updates (2026-03-02)

- VPS manual deploy uses SSH key `C:\Users\Jetze\Documents\SSH Keys\id_ed25519`; `C:\Users\Jetze\.ssh\id_ed25519` is a different keypair and may not be authorized on the Hetzner host.
- Deploy fallback for VPS auth/registry issues: sync repo snapshot to `/opt/jetllm`, normalize `docker-entrypoint.sh` line endings (`sed -i 's/\r$//'`), build `ghcr.io/j3tze/jetllm:latest` locally on VPS, and run `docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d --pull never`.
- Production JetLLM route is `jet.dozzzer.com` behind Cloudflare and Nginx Proxy Manager (`/opt/open-webui/data/nginx/proxy_host/3.conf`) forwarding to `172.17.0.1:3000` with websocket headers and `proxy_buffering off` for streaming.
- `jet.dozzzer.com` uses a dedicated Let's Encrypt certificate at `/opt/open-webui/letsencrypt/live/jet.dozzzer.com/` to satisfy Cloudflare Full (strict) and prevent edge `526` errors.
- Restored chat markdown/code rendering in `src/components/chat/message-list.tsx` and `src/components/chat/code-block.tsx` by switching message text back to `react-markdown` + `remark-gfm` and re-enabling Shiki highlighting with plaintext fallback, fixing the regression where markdown formatting and fenced-code syntax highlighting no longer displayed.
- Docker image optimization pass:
  - Enabled BuildKit layer caching for `npm ci` and switched runner `COPY` commands to `--chown`/`--chmod` to avoid broad post-copy ownership rewrites.
  - Limited copied `sqlite-vec` platform artifacts to Linux packages in the runner image.
  - Replaced recursive startup `chown -R /app/data` with targeted writability checks for `DB_PATH` and SQLite sidecar files (`-wal`, `-shm`) to reduce container startup overhead on large volumes.
- Added GitLab CI/CD pipeline support via `.gitlab-ci.yml`:
  - `publish_image` builds/pushes image tags to GitLab Container Registry (`sha-*`, `latest`, release tag).
  - `deploy_vps` SSHes to the VPS and redeploys `latest` image via compose pull/up (image-only; no VPS `git pull`).
  - Added GitLab deployment guide at `docs/deploy-vps-gitlab.md` with required CI variables.
- Validated GitLab pipeline on `master` end-to-end (`publish_image` success, `deploy_vps` success) and confirmed container recreation on VPS with `registry.gitlab.com/j3tze/jetllm:latest` at `0.0.0.0:3000->3000/tcp`.
- For private GitLab registry pulls on VPS, `VPS_REGISTRY_USER` and `VPS_REGISTRY_PASSWORD` must be set so deploy job can run `docker login` before `docker compose pull`; missing values cause `access forbidden`.
- Initial GitLab CI runs may fail with `Identity verification is required in order to run CI jobs`; complete account verification in GitLab web UI, then rerun the pipeline.
- Ran `/status` (`git status --short --branch`) to snapshot local WIP on `master...origin/master`; current tracked edits are in Docker/chat rendering/deploy docs plus new `.gitlab-ci.yml` and `docs/deploy-vps-gitlab.md`, to keep collaboration handoff accurate.
- Added chat speech-to-text support in `src/components/chat/chat-input.tsx` with a microphone button left of Send: uses browser `SpeechRecognition` when available and falls back to `MediaRecorder` upload/transcription for Firefox/unsupported browsers, so voice input works across major desktop browsers.
- Added authenticated STT API route `src/app/api/speech/transcribe/route.ts` with provider fallback order (`groq` -> `openai` -> `custom`) against OpenAI-compatible `/audio/transcriptions`, defaulting to low-cost Groq when configured and returning actionable errors when no STT key is available.
- Added targeted tests for speech transcription route behavior in `src/app/api/speech/transcribe/__tests__/route.test.ts` (auth guard, missing audio validation, Groq-first success, OpenAI fallback, and missing-provider handling) to keep regression coverage on the new voice path.
- Investigated Codex quota warning mismatch (weekly warning vs `/status`): local session telemetry shows separate `primary` (300-minute) and `secondary` (10080-minute weekly) limits (for example `57%` used vs `79%` used), explaining why a weekly "25% left" warning can differ from `/status` output depending on which bucket is shown.
- Checked current Codex usage snapshot from local session telemetry: `primary` (300-minute) is `58%` used (`42%` left, reset at `2026-03-02 16:57:18 +01:00`) and `secondary` weekly (10080-minute) is `79%` used (`21%` left, reset at `2026-03-05 00:33:40 +01:00`), so the active weekly headroom is about one-fifth.
- Verified local Codex CLI capabilities (`codex --help`, `codex features list`) and found no built-in user config to enforce a hard "primary-window-only" throttle; usage control must be managed via model/effort choices or a local wrapper/check before launching sessions.
- Uninstalled `oh-my-opencode` for the local user by removing its plugin entry from `C:\Users\Jetze\.config\opencode\opencode.json`, deleting `C:\Users\Jetze\.config\opencode\oh-my-opencode.json`, and clearing Bun cache directories under `C:\Users\Jetze\.bun\install\cache\oh-my-opencode*` so the integration no longer loads and cached installer artifacts are removed.
- Migrated discovered Claude skill files (`use-gunshi-cli`, `byethrow`, `create-shortcut`) into OpenCode global skills at `C:\Users\Jetze\.config\opencode\skills\<skill>\SKILL.md` so OpenCode can auto-discover them outside Claude-only folders.
- Mirrored those same skill definitions into Codex user skills at `C:\Users\Jetze\.codex\skills\user\<skill>\SKILL.md` so both OpenCode and Codex can load the same local skill set.
- Improved mobile chat ergonomics by adding opposite-direction swipe-to-close support for the sidebar in `src/hooks/use-swipe-sidebar.ts` + `src/components/app/main-shell.tsx`, centering/constraining provider-model controls in `src/components/chat/chat-panel.tsx` + `src/components/chat/model-selector.tsx`, and restyling `src/components/chat/chat-input.tsx` controls into lighter circular actions so the mobile composer no longer looks cramped or blocky.
- Added a reusable `deploy` skill (slash command `/deploy` in OpenCode) at `C:\Users\Jetze\.config\opencode\skills\deploy\SKILL.md` and mirrored it to `C:\Users\Jetze\.codex\skills\user\deploy\SKILL.md` to run the push -> GitLab pipeline -> VPS redeploy flow with built-in handling for manual deploy jobs and common auth/registry failures.
- Revalidated the mobile chat UX pass (`src/hooks/use-swipe-sidebar.ts`, `src/components/app/main-shell.tsx`, `src/components/chat/chat-panel.tsx`, `src/components/chat/model-selector.tsx`, `src/components/chat/chat-input.tsx`) with `npm run lint` and `npm run build` passing; targeted `npm test -- src/components/chat/__tests__/model-selector.test.tsx` currently exits with an environment-level Vitest `ERR_REQUIRE_ESM` (`html-encoding-sniffer` via `@exodus/bytes`) before test collection.
- Updated the Send action styling in `src/components/chat/chat-input.tsx` to use the same neutral white/grey treatment as other composer icon buttons (instead of accented primary color) so the mobile input controls stay visually consistent.
- Removed the Send button's disabled-state dimming in `src/components/chat/chat-input.tsx` so it stays the same neutral white/grey shade as the `+`, attach, and mic controls even when sending is unavailable.
- Hardened the mirrored `deploy` skills at `C:\Users\Jetze\.config\opencode\skills\deploy\SKILL.md` and `C:\Users\Jetze\.codex\skills\user\deploy\SKILL.md` to check `glab` auth first and use `GLAB_TOKEN`/`GITLAB_TOKEN` env fallback for private-pipeline polling, while explicitly avoiding hardcoded PATs in skill files.
- Stored `GITLAB_TOKEN` and `GLAB_TOKEN` as persistent user environment variables on the local machine (without saving secrets in repo files) so GitLab private-pipeline checks can authenticate across new shell sessions.
- Trimmed `AGENTS.md` recent notes to keep this log focused on project-relevant engineering/deploy changes rather than local desktop customization entries.
- Replaced PWA icon assets in `public/icons/icon-192.svg` and `public/icons/icon-512.svg` with the JetLLM green paper-plane mark so installed app icons on Android match JetLLM branding instead of the previous blue "J" placeholder.
- Widened mobile chat controls by increasing composer sizing in `src/components/chat/chat-input.tsx` and removing mobile selector width constraints in `src/components/chat/chat-panel.tsx` + `src/components/chat/model-selector.tsx`, so the top provider/model controls use available screen width without going off-screen.

## Planning Docs

- `docs/plans/2026-02-24-jetllm-design.md`
- `docs/plans/2026-02-24-jetllm-mvp-plan.md`
- `docs/plans/2026-02-27-chat-appearance-design.md`
- `docs/plans/2026-02-27-code-blocks-design.md`
- `docs/plans/2026-02-27-projects-rag-design.md`
- `docs/plans/2026-02-27-projects-rag-plan.md`
- `docs/plans/2026-02-27-web-search-design.md`
- `docs/plans/2026-02-27-web-search-plan.md`
