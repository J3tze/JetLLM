# JetLLM Design Document

**Date:** 2026-02-24
**Status:** Approved

## Overview

JetLLM is a sleek, feature-rich LLM web UI similar to OpenWebUI and LibreChat. It supports multiple cloud providers, automatic memory, coding tools, web search, image generation, and deep customization — all wrapped in a modern AMOLED-black interface.

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **LLM Integration:** Vercel AI SDK (unified provider access)
- **UI:** Tailwind CSS + shadcn/ui
- **Database:** SQLite via Drizzle ORM + better-sqlite3
- **Vector Search:** sqlite-vec (for RAG embeddings)
- **Deployment:** Docker (single container)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Next.js App Router                 │
├──────────────────────┬──────────────────────────────┤
│     Frontend (React) │     API Routes (Server)      │
│                      │                              │
│  Chat Interface      │  Provider Router             │
│  (streaming)         │  (Vercel AI SDK)             │
│                      │                              │
│  Artifacts /         │  Memory Service              │
│  Canvas Panel        │  (auto-extract + store)      │
│                      │                              │
│  Settings UI         │  RAG Pipeline                │
│                      │  (embed + search)            │
│                      │                              │
│  Image Gen UI        │  Web Search Adapters         │
│                      │  (Tavily/Brave/SearXNG/Google)│
│                      │                              │
│  Theme System        │  ComfyUI Client              │
│  (CSS vars +         │  (RunPod image gen)          │
│   Tailwind)          │                              │
│                      │  Code Sandbox                │
│                      │  (isolated execution)        │
│                      │                              │
│                      │  SQLite + sqlite-vec         │
│                      │  (via Drizzle ORM)           │
└──────────────────────┴──────────────────────────────┘
                       │
               Docker Container
```

## Project Structure

```
jetllm/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (chat)/             # Chat route group
│   │   │   ├── page.tsx        # Main chat page
│   │   │   └── [id]/page.tsx   # Specific conversation
│   │   ├── settings/           # Settings pages
│   │   ├── api/                # API routes
│   │   │   ├── chat/           # Chat completion endpoint
│   │   │   ├── search/         # Web search endpoint
│   │   │   ├── images/         # Image generation endpoint
│   │   │   ├── memory/         # Memory CRUD
│   │   │   ├── documents/      # RAG document upload
│   │   │   └── execute/        # Code execution
│   │   └── layout.tsx          # Root layout + theme provider
│   ├── components/
│   │   ├── chat/               # Chat UI components
│   │   ├── artifacts/          # Canvas/artifacts panel
│   │   ├── settings/           # Settings components
│   │   └── ui/                 # shadcn/ui base components
│   ├── lib/
│   │   ├── providers/          # LLM provider configs
│   │   ├── memory/             # Memory extraction + storage
│   │   ├── rag/                # Embedding + vector search
│   │   ├── search/             # Web search adapters
│   │   ├── images/             # ComfyUI client
│   │   ├── sandbox/            # Code execution sandbox
│   │   ├── db/                 # Drizzle schema + migrations
│   │   └── theme/              # Theme configuration
│   └── hooks/                  # React hooks
├── public/                     # Static assets
├── data/                       # SQLite DB + uploaded files (Docker volume)
├── Dockerfile
├── docker-compose.yml
├── drizzle.config.ts
└── package.json
```

## Database Schema

### Core Tables (SQLite via Drizzle)

**conversations**
- id (text, primary key, ULID)
- title (text)
- model (text)
- provider (text)
- system_prompt (text, nullable)
- created_at (integer, unix timestamp)
- updated_at (integer, unix timestamp)

**messages**
- id (text, primary key, ULID)
- conversation_id (text, foreign key)
- role (text: "user" | "assistant" | "system" | "tool")
- content (text)
- tool_calls (text, JSON, nullable)
- metadata (text, JSON, nullable)
- created_at (integer, unix timestamp)

**memories**
- id (text, primary key, ULID)
- type (text: "fact" | "preference" | "summary")
- content (text)
- source_conversation_id (text, nullable)
- created_at (integer, unix timestamp)

**documents**
- id (text, primary key, ULID)
- name (text)
- content (text)
- chunk_count (integer)
- created_at (integer, unix timestamp)

**document_chunks**
- id (text, primary key, ULID)
- document_id (text, foreign key)
- content (text)
- embedding (blob, sqlite-vec vector)

**settings**
- key (text, primary key)
- value (text, JSON)

**generated_images**
- id (text, primary key, ULID)
- prompt (text)
- provider (text)
- path (text)
- conversation_id (text, nullable)
- created_at (integer, unix timestamp)

## Multi-Provider System

### Supported Providers

OpenAI, Anthropic, Google Gemini, Mistral, Groq, Cohere, Together AI, OpenRouter, and any custom OpenAI-compatible endpoint (Ollama, LM Studio, etc.).

### Provider Configuration

Each provider stored in settings:
- Provider name
- API key (encrypted at rest)
- Base URL (optional, for custom endpoints)
- Available models (fetched from API or user-defined)
- Default parameters (temperature, max_tokens, etc.)

### Chat Flow

1. User sends message -> frontend calls `useChat` hook (Vercel AI SDK)
2. Request hits `/api/chat` with conversation_id, model, provider
3. Server builds context: system prompt + relevant memories + RAG results + message history
4. Vercel AI SDK streams response from chosen provider
5. Frontend renders streaming markdown with syntax highlighting
6. On completion: save message to DB, run memory extraction in background
7. If model used tools (search, code exec, image gen): execute and stream results back

### Customization

Configurable per-conversation or as global defaults:
- System prompt (editable in drawer/modal)
- Temperature, top_p, max_tokens (sliders in chat header)
- Model selection (searchable dropdown in chat header)
- Provider (auto-detected from model or manually set)

## Memory System

### Automatic Memory Extraction

Runs as a background job after each assistant response:

1. Send conversation context to a fast/cheap model (e.g., GPT-4o-mini or Haiku)
2. Prompt extracts: user facts, preferences, important context
3. Compare against existing memories to deduplicate
4. Store new memories in the `memories` table with type classification

### Memory Types

- **fact** — "User's name is Jetze", "User prefers TypeScript"
- **preference** — "User likes AMOLED dark themes", "User uses Docker"
- **summary** — Compressed summary of a past conversation

### Memory Injection

- Before each LLM call, retrieve relevant memories (keyword match + recency scoring)
- Inject as system-level context: "Here's what you know about the user: ..."
- Budget: ~500 tokens max to avoid wasting context window

### Manual Management

- Settings page lists all memories with edit/delete
- User can manually add memories
- Toggle automatic memory on/off globally or per conversation

## RAG / Document Knowledge Base

1. User uploads a document (PDF, text, markdown, code files)
2. Server chunks the document (by paragraphs/sections, ~500 tokens per chunk)
3. Embed each chunk using configurable embedding model (default: OpenAI `text-embedding-3-small`)
4. Store embeddings in sqlite-vec
5. At query time: embed user's message, find top-K similar chunks, inject as context

## Web Search

### Architecture

Implemented as LLM tool calls — model decides when to search (automatic) or user forces it (manual toggle in input bar).

### Adapter Pattern

Each search provider implements a common interface:
```typescript
interface SearchAdapter {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
}
```

### Supported Providers

Tavily, Brave Search, SearXNG (self-hosted), Google Custom Search. User configures their preferred provider + API key in settings.

### Flow

Model calls `web_search` tool -> adapter queries search API -> results injected back into context -> model synthesizes answer with citations.

## Code Execution

### Sandboxed Execution

- **JavaScript:** isolated-vm (V8 isolates) — in-process, secure
- **Python (future):** sidecar Docker container for isolated execution

### UI

- Code blocks in chat get a "Run" button
- Output appears inline below the code block
- Supports stdout, stderr, and error display

## Artifacts / Canvas

A resizable side panel (right side of chat):
- Model creates/updates artifacts via tool calls
- User can manually edit artifact content
- Syntax highlighting for code, markdown preview for text
- Version history with undo/redo
- Panel slides in from right when active, resizable divider

## Image Generation (ComfyUI via RunPod)

### Flow

1. User requests image or model decides to generate one
2. Server sends workflow to ComfyUI API on RunPod (REST)
3. Poll for completion, download result
4. Display inline in chat, save to `generated_images` table and filesystem

### Configuration

- RunPod API key
- Default ComfyUI workflow (JSON)
- Server endpoint
- All configurable in settings

## UI & Theme System

### AMOLED Black Theme

- Base: pure black (`#000000`) for true AMOLED power savings
- Surfaces: very dark grays (`#0a0a0a`, `#111111`) for cards, sidebars, modals
- Borders: subtle (`#1a1a1a`)
- Text: white (`#fafafa`) primary, muted gray (`#888888`) secondary

### Accent Color System

CSS custom properties drive the accent system:
```css
:root {
  --accent: 220 90% 56%;
  --accent-foreground: 0 0% 100%;
}
```

Presets: blue, purple, green, red, orange, pink, cyan. Custom hex color also supported. All interactive elements use the accent variable.

### Chat Backgrounds

- Default: plain black
- Options: subtle patterns (dots, grid, noise), gradients, custom image upload
- Applied via CSS background on the chat scroll area
- Persisted in settings

### Layout

```
┌──────────┬────────────────────────┬──────────────┐
│          │                        │              │
│ Sidebar  │     Chat Area          │  Artifacts   │
│          │                        │  Panel       │
│ - Convos │  ┌──────────────────┐  │  (toggle)    │
│ - Search │  │ Messages         │  │              │
│ - New    │  │ (streaming)      │  │              │
│   chat   │  │                  │  │              │
│          │  └──────────────────┘  │              │
│          │  ┌──────────────────┐  │              │
│          │  │ Input bar        │  │              │
│          │  │ [model] [tools]  │  │              │
│          │  └──────────────────┘  │              │
└──────────┴────────────────────────┴──────────────┘
```

- Sidebar: collapsible, conversation list with search/filter
- Chat area: full-width when artifacts panel is closed
- Input bar: model selector, tool toggles, attachment button, parameter quick-access
- Artifacts panel: slides in from right, resizable

### Responsive

Mobile-first: sidebar becomes drawer, artifacts panel goes full-screen on mobile.

## Deployment

### Docker

Single Dockerfile with multi-stage build:
1. Build stage: install deps, build Next.js
2. Runtime stage: minimal Node.js image, copy built app
3. Data directory mounted as Docker volume for persistence

### docker-compose.yml

```yaml
services:
  jetllm:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - jetllm-data:/app/data
    environment:
      - NODE_ENV=production

volumes:
  jetllm-data:
```

## MVP Scope

**Phase 1 (MVP):** Core chat + providers + sleek UI
- Multi-provider chat with streaming
- AMOLED theme with accent colors
- Conversation management (create, list, delete)
- Settings page for provider configuration
- Model selector and parameter controls
- Docker deployment

**Phase 2:** Memory + RAG
- Automatic memory extraction
- Memory management UI
- Document upload and RAG pipeline

**Phase 3:** Tools
- Web search (multi-provider)
- Code execution (JS sandbox)
- Artifacts/canvas panel

**Phase 4:** Image Generation + Polish
- ComfyUI integration
- Chat backgrounds
- Mobile responsiveness
- Python code execution
