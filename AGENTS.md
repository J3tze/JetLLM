# AGENTS.md

This file provides guidance to coding agents (Codex, Claude Code, etc.) working in this repository.

## Project Overview

JetLLM is a multi-provider LLM web UI with streaming chat, automatic memory extraction, provider/model switching, and customizable chat theming (including wallpaper images).

## Tech Stack

- Next.js 16 (App Router, TypeScript, strict mode)
- Vercel AI SDK v6 (`ai`, `@ai-sdk/react`)
- SQLite via Drizzle ORM + `better-sqlite3`
- Tailwind CSS v4 + shadcn/ui + `next-themes`
- Vitest for tests

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Key Paths

- App shell: `src/app/page.tsx`, `src/app/layout.tsx`
- Global styles/theme vars: `src/app/globals.css`
- Chat UI: `src/components/chat/*`
- Settings UI: `src/app/settings/page.tsx`, `src/components/settings/*`
- API routes: `src/app/api/*`
- Providers: `src/lib/providers/*`
- Memory logic: `src/lib/memory/*`
- DB schema: `src/lib/db/schema.ts`

## Theme/Styling Notes

- Dark theme is the primary target.
- Accent and many CSS vars are applied via JS (`ThemeInitializer` and `useAccentColor`) instead of relying purely on CSS cascade.
- Chat wallpaper is controlled by `--chat-bg-image` and is stored in settings under `ui:chatTheme.bgImage`.
- Glass/translucent styling uses `.glass-panel` and `.glass-control` in `globals.css`.

## Development Expectations

- Keep visual changes consistent across desktop and mobile.
- For UI work, validate with screenshots (or Playwright) after changes.
- Prefer targeted lint/test commands for touched files first.
- Do not revert unrelated local changes.

## Source of Truth

- `CLAUDE.md` contains a detailed architecture reference. Use it for deeper context when needed.
