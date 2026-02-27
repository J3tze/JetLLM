# Projects & RAG Design

## Overview

Add a Projects system (like ChatGPT Projects) with per-project document knowledge base (RAG). Projects group conversations under a named container with an emoji icon, a project-specific system prompt, and attached files that are chunked, embedded, and searched at chat time.

Also: auto-title conversations via LLM after first assistant response, and swipe-to-open sidebar on mobile PWA.

## Data Model

### New Tables

**`projects`**
- `id` — text, PK, ULID
- `name` — text, default "New Project"
- `icon` — text, single emoji, default "📁"
- `systemPrompt` — text, nullable (appended to global system prompt for all conversations in this project)
- `createdAt` — integer, unix timestamp
- `updatedAt` — integer, unix timestamp

**`documents`**
- `id` — text, PK, ULID
- `projectId` — text, FK → projects, cascade delete
- `name` — text (original filename)
- `content` — text (full raw text, kept for potential re-chunking)
- `chunkCount` — integer
- `status` — text: "processing" | "ready" | "error"
- `createdAt` — integer, unix timestamp

**`document_chunks`** (managed via raw SQL for sqlite-vec compatibility)
- `id` — text, PK, ULID
- `documentId` — text, FK → documents, cascade delete
- `content` — text (the chunk text, ~500 tokens)
- `embedding` — float32 vector via sqlite-vec virtual table

### Modified Tables

**`conversations`** — add column:
- `projectId` — text, nullable, FK → projects, set null on delete

Conversations with `projectId = null` are standalone (appear in "Chats" section). Conversations with a `projectId` belong to that project.

## RAG Pipeline

### Upload Flow

1. User clicks paperclip on project home page → file picker
2. Accepted formats: `.txt`, `.md`, `.ts`, `.js`, `.py`, `.json`, `.yaml`, `.toml`, `.csv`, `.xml`, `.html`, `.css`, `.rs`, `.go`, `.java`, `.c`, `.cpp`, `.h`, `.sh`, `.sql`, `.env`, `.cfg`, `.ini`, `.log`
3. File size limit: 5 MB (enforced client + server)
4. File read as UTF-8 → POST `/api/projects/[id]/documents` (multipart form data)
5. Server saves document row with `status: "processing"`, returns immediately
6. Background job: chunk text → embed via `embedMany()` → store in sqlite-vec → update `status: "ready"`
7. On error: set `status: "error"`, log details

### Chunking Strategy

Split on double newlines (paragraphs) first. If a chunk exceeds ~500 tokens, split on single newlines, then on sentence boundaries (`. `, `? `, `! `). Target ~500 tokens per chunk with ~50 token overlap between consecutive chunks for context continuity. Token estimation: 1 token ≈ 4 characters.

### Embedding

- Setting: `rag:model` — `{ provider, model }` (same pattern as `memory:model`)
- Default suggestion in UI: OpenAI `text-embedding-3-small`
- Uses Vercel AI SDK `embedMany()` for batch upload, `embed()` for single query embedding
- Provider resolved via existing `getModel()` pattern but using `embedding()` method instead of `chat()`

### Query Flow (at chat time)

1. Chat route receives message for a conversation with `projectId`
2. Look up project → check if it has documents with `status: "ready"`
3. If yes: embed user's last message using configured `rag:model`
4. sqlite-vec similarity search: top 5 chunks from that project's documents
5. Format chunks as context block, inject into system prompt after memories but before web search results
6. Budget: ~2000 tokens for RAG context
7. If no documents or no `rag:model` configured: skip RAG entirely (no wasted API call)

### System Prompt Assembly Order

```
1. Base system prompt (global setting or conversation-level)
2. Project system prompt (if conversation belongs to a project)
3. User name injection
4. Memory context (if enabled)
5. RAG document context (if project has documents)
6. Web search results (if enabled)
```

## Sidebar Layout

```
┌─────────────────────────┐
│ [+ New Chat]            │
├─────────────────────────┤
│ PROJECTS            [+] │
│ 🚀 JetLLM Dev       ⋯  │
│ 🍳 Recipes           ⋯  │
├─────────────────────────┤
│ CHATS                   │
│ Fix the streaming bu... │
│ What is quantum com...  │
└─────────────────────────┘
```

- **Projects section** at top with [+] button to create new project
- Each project row: emoji + name, three-dot menu on hover (Rename, Change Icon, Settings, Delete)
- **Chats section** below: standalone conversations without a project (current behavior)
- **"+ New Chat"** at top creates standalone conversation
- On mobile: **swipe right from left edge** to open sidebar (touch gesture handler on the main content area)

## Project Home Page

Displayed when clicking a project in the sidebar. Replaces the chat view in the main content area.

```
┌─────────────────────────────────────┐
│ [←] 🚀 JetLLM Dev            [⚙️] │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Start a new conversation... │    │
│  └─────────────────────────────┘    │
│                                     │
│  FILES (3)                    [📎]  │
│  CLAUDE.md · schema.ts · design.md  │
│                                     │
│  RECENT CONVERSATIONS               │
│  Fix the streaming bug...           │
│  How does the memory system...      │
│  Add Docker deployment              │
└─────────────────────────────────────┘
```

- **Header:** back arrow + emoji + project name + gear icon
- **Chat input:** starts a new conversation within the project
- **Files section:** compact — just filenames inline as tags/chips. Paperclip button to add. Click a file to see details (chunk count, status) or remove it. Processing files show a small spinner.
- **Recent conversations:** clickable list, opens conversation with project context active
- **Gear icon:** opens settings modal

### Project Settings Modal

- Project name (text input)
- Emoji picker (grid of common emojis, or type directly)
- System prompt (textarea, placeholder: "Instructions for all conversations in this project...")
- Save / Cancel

## Auto-Title Conversations

Separate from projects but implemented alongside.

- Triggered in chat route `onFinish` after the first assistant response
- Condition: conversation title still matches the truncated first user message (the default from `handleSend` which does `text.slice(0, 50)`)
- Uses same model config as memory extraction (`memory:model`)
- Prompt: "Generate a concise title (3-6 words) for this conversation. Respond with only the title, no quotes."
- Input: first user message + first assistant response (truncated to ~500 chars each)
- Fire-and-forget: updates `conversations.title` in DB
- Sidebar reflects new title on next fetch/refresh

## Mobile Swipe-to-Open Sidebar

Separate from projects but implemented alongside.

- Touch gesture handler on the main content area
- Detect right-swipe from left edge (touch start within 30px of left edge, swipe distance > 50px)
- Triggers the same sidebar open action as `SidebarTrigger`
- Uses the existing shadcn sidebar's `open`/`setOpen` state
- Only active on touch devices (check `ontouchstart` or media query)

## API Routes

### Projects
- `GET /api/projects` — list all projects (ordered by updatedAt desc)
- `POST /api/projects` — create project `{ name?, icon? }`
- `GET /api/projects/[id]` — get project with document count and conversation count
- `PATCH /api/projects/[id]` — update `{ name?, icon?, systemPrompt? }`
- `DELETE /api/projects/[id]` — delete project (cascades documents/chunks; conversations get `projectId = null`)

### Documents
- `GET /api/projects/[id]/documents` — list documents for a project
- `POST /api/projects/[id]/documents` — upload file (multipart form), triggers background processing
- `DELETE /api/projects/[id]/documents/[docId]` — delete document + chunks

### RAG Settings
- Configured via existing settings API: `rag:model` key with `{ provider, model }` value
- UI: embedding model picker on the Settings page (RAG section within Memory tab, or new "Knowledge" tab)

## Dependencies

- `sqlite-vec` — native SQLite extension for vector similarity search
- No new npm packages for chunking (implemented in plain JS)
- Vercel AI SDK `embed()` / `embedMany()` already available

## File Structure

```
src/lib/
  projects.ts              # Project CRUD service (factory pattern)
  rag/
    chunker.ts             # Text chunking logic
    embeddings.ts          # Embed helper (wraps AI SDK embed/embedMany)
    search.ts              # Vector similarity search via sqlite-vec
    process.ts             # Background document processing job
  db/
    schema.ts              # Add projects, documents, document_chunks tables
    index.ts               # Add ensureTables for new tables + sqlite-vec setup

src/app/api/
  projects/
    route.ts               # GET (list), POST (create)
    [id]/
      route.ts             # GET, PATCH, DELETE
      documents/
        route.ts           # GET (list), POST (upload)
        [docId]/
          route.ts         # DELETE

src/components/
  chat/
    chat-sidebar.tsx       # Modified: projects section + chats section
    project-home.tsx       # New: project home page
    project-settings.tsx   # New: settings modal (name, icon, prompt)
    emoji-picker.tsx       # New: emoji grid picker

src/hooks/
  use-projects.ts          # New: project CRUD hook
  use-swipe-sidebar.ts     # New: touch gesture handler
```
