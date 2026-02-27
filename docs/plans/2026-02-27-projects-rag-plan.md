# Projects & RAG Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Projects system with per-project document RAG, auto-titling conversations, and mobile swipe-to-open sidebar.

**Architecture:** Projects are a new first-class entity sitting above conversations. Each project has an emoji icon, name, system prompt, and attached documents. Documents are chunked and embedded via configurable embedding model, stored in sqlite-vec for vector similarity search. At chat time, the user's message is embedded and top-5 similar chunks are injected into the system prompt. The sidebar splits into Projects + Chats sections.

**Tech Stack:** sqlite-vec (native C extension), Vercel AI SDK `embed()`/`embedMany()`, existing Drizzle ORM + better-sqlite3 stack

**Design Doc:** `docs/plans/2026-02-27-projects-rag-design.md`

---

## Task 1: Install sqlite-vec and Add Schema

**Files:**
- Modify: `package.json`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/index.ts`

**Step 1: Install sqlite-vec**

Run:
```bash
npm install sqlite-vec
```

**Step 2: Add projects, documents tables to Drizzle schema**

In `src/lib/db/schema.ts`, add after the `memories` table:

```typescript
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("New Project"),
  icon: text("icon").notNull().default("📁"),
  systemPrompt: text("system_prompt"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: text("content").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  status: text("status", { enum: ["processing", "ready", "error"] }).notNull().default("processing"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})
```

**Step 3: Add `projectId` column to conversations table**

In `src/lib/db/schema.ts`, add to the `conversations` table definition:

```typescript
projectId: text("project_id")
  .references(() => projects.id, { onDelete: "set null" }),
```

**Step 4: Update `ensureTables()` in `src/lib/db/index.ts`**

Add the new tables to `ensureTables()`. Also load the sqlite-vec extension and create the `document_chunks` virtual table (sqlite-vec tables can't be defined via Drizzle — they use a special `CREATE VIRTUAL TABLE` syntax).

```typescript
import * as sqliteVec from "sqlite-vec"

// Inside ensureTables(), after existing CREATE TABLE statements:

// Add projectId to conversations if not exists
try {
  sqlite.exec(`ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`)
} catch {
  // Column already exists
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'New Project',
    icon TEXT NOT NULL DEFAULT '📁',
    system_prompt TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'ready', 'error')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL
  );
`)

// Load sqlite-vec extension and create vector index
sqliteVec.load(sqlite)
// vec_chunks is a virtual table that pairs with document_chunks for vector search
sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
    chunk_id TEXT PRIMARY KEY,
    embedding float[1536]
  );
`)
```

Note: `vec_chunks` is a separate virtual table that stores the vector embeddings. We join it with `document_chunks` via `chunk_id = id` at query time. The dimension `1536` matches OpenAI `text-embedding-3-small` — this is the default and most common dimension.

**Step 5: Run to verify**

Run:
```bash
npm run build
```
Expected: Build succeeds. The sqlite-vec native extension loads correctly.

**Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/db/
git commit -m "feat: add projects, documents, document_chunks schema with sqlite-vec"
```

---

## Task 2: Projects Service Layer

**Files:**
- Create: `src/lib/projects.ts`
- Test: `src/lib/__tests__/projects.test.ts`

**Step 1: Create projects service**

Create `src/lib/projects.ts` following the existing factory pattern from `conversations.ts`:

```typescript
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq, desc, isNull } from "drizzle-orm"
import { ulid } from "ulid"
import * as schema from "@/lib/db/schema"
import { getDb } from "@/lib/db"

export type Project = typeof schema.projects.$inferSelect

export function createProjectsService(db: BetterSQLite3Database<typeof schema>) {
  return {
    create(data: { name?: string; icon?: string }): Project {
      const id = ulid()
      const now = new Date()
      db.insert(schema.projects)
        .values({
          id,
          name: data.name || "New Project",
          icon: data.icon || "📁",
          createdAt: now,
          updatedAt: now,
        })
        .run()
      return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()!
    },

    list(): Project[] {
      return db.select().from(schema.projects).orderBy(desc(schema.projects.updatedAt)).all()
    },

    get(id: string): Project | undefined {
      return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()
    },

    update(id: string, data: Partial<{ name: string; icon: string; systemPrompt: string | null }>): void {
      db.update(schema.projects)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.projects.id, id))
        .run()
    },

    delete(id: string): void {
      db.delete(schema.projects).where(eq(schema.projects.id, id)).run()
    },

    getConversations(projectId: string) {
      return db.select().from(schema.conversations)
        .where(eq(schema.conversations.projectId, projectId))
        .orderBy(desc(schema.conversations.updatedAt))
        .all()
    },

    getStandaloneConversations() {
      return db.select().from(schema.conversations)
        .where(isNull(schema.conversations.projectId))
        .orderBy(desc(schema.conversations.updatedAt))
        .all()
    },
  }
}

// Convenience functions
export function createProject(data: Parameters<ReturnType<typeof createProjectsService>["create"]>[0]) {
  return createProjectsService(getDb()).create(data)
}
export function listProjects() {
  return createProjectsService(getDb()).list()
}
export function getProject(id: string) {
  return createProjectsService(getDb()).get(id)
}
export function updateProject(id: string, data: Parameters<ReturnType<typeof createProjectsService>["update"]>[1]) {
  return createProjectsService(getDb()).update(id, data)
}
export function deleteProject(id: string) {
  return createProjectsService(getDb()).delete(id)
}
export function getProjectConversations(projectId: string) {
  return createProjectsService(getDb()).getConversations(projectId)
}
export function getStandaloneConversations() {
  return createProjectsService(getDb()).getStandaloneConversations()
}
```

**Step 2: Write tests**

Create `src/lib/__tests__/projects.test.ts` following the pattern in `src/lib/__tests__/conversations.test.ts` (uses `createTestDb()` with in-memory SQLite). Test CRUD operations, cascading deletes, and the `getStandaloneConversations` filter.

**Step 3: Run tests**

Run:
```bash
npm test -- src/lib/__tests__/projects.test.ts
```
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/lib/projects.ts src/lib/__tests__/projects.test.ts
git commit -m "feat: add projects service layer with CRUD and conversation filtering"
```

---

## Task 3: Projects API Routes

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[id]/route.ts`

**Step 1: Create project list + create route**

Create `src/app/api/projects/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { listProjects, createProject } from "@/lib/projects"

export async function GET() {
  try {
    const projects = listProjects()
    return NextResponse.json(projects)
  } catch (error) {
    console.error("[projects] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, icon } = body
    const project = createProject({ name, icon })
    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    console.error("[projects] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

**Step 2: Create project detail route**

Create `src/app/api/projects/[id]/route.ts` with GET, PATCH, DELETE handlers. Follow the same try/catch pattern as `src/app/api/conversations/[id]/route.ts`. GET should also return document count and conversation count for the project home page.

**Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: Build succeeds with new routes listed.

**Step 4: Commit**

```bash
git add src/app/api/projects/
git commit -m "feat: add projects API routes (CRUD)"
```

---

## Task 4: Update Conversations to Support projectId

**Files:**
- Modify: `src/lib/conversations.ts`
- Modify: `src/app/api/conversations/route.ts`

**Step 1: Update conversations service**

In `src/lib/conversations.ts`, modify the `create` method to accept an optional `projectId` parameter. Add it to the insert values.

**Step 2: Update conversations API route**

In `src/app/api/conversations/route.ts`, accept `projectId` in the POST body and pass it through to `createConversation()`. Update the GET to optionally filter by `projectId` query param.

**Step 3: Run existing tests**

Run:
```bash
npm test -- src/lib/__tests__/conversations.test.ts
```
Expected: Existing tests still pass (projectId is optional, defaults to null).

**Step 4: Commit**

```bash
git add src/lib/conversations.ts src/app/api/conversations/
git commit -m "feat: add projectId support to conversations"
```

---

## Task 5: Text Chunker

**Files:**
- Create: `src/lib/rag/chunker.ts`
- Create: `src/lib/rag/__tests__/chunker.test.ts`

**Step 1: Write chunker tests**

Create `src/lib/rag/__tests__/chunker.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { chunkText } from "../chunker"

describe("chunkText", () => {
  it("returns single chunk for short text", () => {
    const chunks = chunkText("Hello world")
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe("Hello world")
  })

  it("splits on double newlines", () => {
    const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three."
    const chunks = chunkText(text, { maxChars: 50 })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it("respects maxChars limit", () => {
    const text = "A".repeat(5000)
    const chunks = chunkText(text, { maxChars: 2000 })
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2200) // allow small overflow for overlap
    }
  })

  it("adds overlap between chunks", () => {
    const text = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five."
    const chunks = chunkText(text, { maxChars: 40, overlap: 10 })
    if (chunks.length > 1) {
      // Last chars of chunk[0] should appear at start of chunk[1]
      const tail = chunks[0].slice(-10)
      expect(chunks[1].startsWith(tail) || chunks[1].includes(tail.trim())).toBe(true)
    }
  })
})
```

**Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- src/lib/rag/__tests__/chunker.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement chunker**

Create `src/lib/rag/chunker.ts`:

```typescript
type ChunkOptions = {
  maxChars?: number  // ~500 tokens × 4 chars/token = 2000 chars default
  overlap?: number   // ~50 tokens × 4 chars/token = 200 chars default
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxChars = 2000, overlap = 200 } = options
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  // Split on double newlines (paragraphs)
  const paragraphs = trimmed.split(/\n\n+/)
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    if (current.length + para.length + 2 <= maxChars) {
      current = current ? current + "\n\n" + para : para
    } else {
      if (current) chunks.push(current)
      // If single paragraph exceeds maxChars, split further
      if (para.length > maxChars) {
        chunks.push(...splitLongBlock(para, maxChars, overlap))
        current = ""
      } else {
        current = para
      }
    }
  }
  if (current) chunks.push(current)

  // Add overlap between chunks
  if (overlap > 0 && chunks.length > 1) {
    return addOverlap(chunks, overlap)
  }

  return chunks
}

function splitLongBlock(text: string, maxChars: number, overlap: number): string[] {
  // Try single newlines, then sentences, then hard split
  const lines = text.split(/\n/)
  if (lines.length > 1) {
    return chunkText(lines.join("\n\n"), { maxChars, overlap: 0 })
  }
  // Split on sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text]
  const chunks: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (current.length + sentence.length <= maxChars) {
      current += sentence
    } else {
      if (current) chunks.push(current.trim())
      current = sentence
    }
  }
  if (current) chunks.push(current.trim())
  return chunks
}

function addOverlap(chunks: string[], overlap: number): string[] {
  const result: string[] = [chunks[0]]
  for (let i = 1; i < chunks.length; i++) {
    const prevTail = chunks[i - 1].slice(-overlap)
    result.push(prevTail + chunks[i])
  }
  return result
}
```

**Step 4: Run tests**

Run:
```bash
npm test -- src/lib/rag/__tests__/chunker.test.ts
```
Expected: All pass.

**Step 5: Commit**

```bash
git add src/lib/rag/
git commit -m "feat: add text chunker for RAG document processing"
```

---

## Task 6: Embedding Helper

**Files:**
- Create: `src/lib/rag/embeddings.ts`
- Modify: `src/lib/providers/index.ts`

**Step 1: Add `getEmbeddingModel()` to providers**

In `src/lib/providers/index.ts`, add a new function `getEmbeddingModel(providerId, modelId)` that returns an `EmbeddingModel` instead of a `LanguageModel`. For OpenAI, use `provider.embedding(modelId)`. For others that support embeddings (Google, Mistral), use their respective `.textEmbeddingModel()` methods. For providers that don't support embeddings (Groq, Anthropic), throw a descriptive error.

**Step 2: Create embedding helper**

Create `src/lib/rag/embeddings.ts`:

```typescript
import { embed, embedMany } from "ai"
import { getEmbeddingModel } from "@/lib/providers"
import { getSetting } from "@/lib/settings"

type EmbeddingModelConfig = { provider: string; model: string }

function getConfiguredModel() {
  const config = getSetting<EmbeddingModelConfig>("rag:model")
  if (!config?.provider || !config?.model) {
    throw new Error("No embedding model configured. Set rag:model in settings.")
  }
  return getEmbeddingModel(config.provider, config.model)
}

export async function embedSingle(text: string): Promise<number[]> {
  const model = getConfiguredModel()
  const { embedding } = await embed({ model, value: text })
  return embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = getConfiguredModel()
  const { embeddings } = await embedMany({ model, values: texts })
  return embeddings
}
```

**Step 3: Commit**

```bash
git add src/lib/providers/index.ts src/lib/rag/embeddings.ts
git commit -m "feat: add embedding model factory and embed helpers for RAG"
```

---

## Task 7: Document Processing Pipeline

**Files:**
- Create: `src/lib/rag/process.ts`
- Create: `src/lib/rag/search.ts`

**Step 1: Create document processor**

Create `src/lib/rag/process.ts` — the background job that chunks a document, embeds the chunks, and stores them in sqlite-vec. Follows the same fire-and-forget pattern as `src/lib/memory/extract.ts`.

```typescript
import { ulid } from "ulid"
import { chunkText } from "./chunker"
import { embedBatch } from "./embeddings"
import { getDb } from "@/lib/db"
import { eq } from "drizzle-orm"
import * as schema from "@/lib/db/schema"

export async function processDocument(documentId: string): Promise<void> {
  const db = getDb()
  try {
    const doc = db.select().from(schema.documents).where(eq(schema.documents.id, documentId)).get()
    if (!doc) return

    // Chunk the document text
    const chunks = chunkText(doc.content)
    if (chunks.length === 0) {
      db.update(schema.documents).set({ status: "ready", chunkCount: 0 }).where(eq(schema.documents.id, documentId)).run()
      return
    }

    // Embed all chunks in a single batch API call
    const embeddings = await embedBatch(chunks)

    // Store chunks + embeddings in a transaction
    // document_chunks is a regular table, vec_chunks is the sqlite-vec virtual table
    const sqlite = (db as any).session.client  // Access raw better-sqlite3 instance
    const insertChunk = sqlite.prepare("INSERT INTO document_chunks (id, document_id, content) VALUES (?, ?, ?)")
    const insertVec = sqlite.prepare("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)")

    const transaction = sqlite.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = ulid()
        insertChunk.run(chunkId, documentId, chunks[i])
        insertVec.run(chunkId, new Float32Array(embeddings[i]))
      }
    })
    transaction()

    // Update document status
    db.update(schema.documents)
      .set({ status: "ready", chunkCount: chunks.length })
      .where(eq(schema.documents.id, documentId))
      .run()

    console.log(`[rag] Processed document ${doc.name}: ${chunks.length} chunks`)
  } catch (error) {
    console.error(`[rag] Failed to process document ${documentId}:`, error)
    db.update(schema.documents)
      .set({ status: "error" })
      .where(eq(schema.documents.id, documentId))
      .run()
  }
}
```

**Step 2: Create vector search**

Create `src/lib/rag/search.ts`:

```typescript
import { embedSingle } from "./embeddings"
import { getDb } from "@/lib/db"

type SearchResult = {
  chunkId: string
  content: string
  distance: number
}

export async function searchDocuments(projectId: string, query: string, topK = 5): Promise<SearchResult[]> {
  const queryEmbedding = await embedSingle(query)
  const db = getDb()
  const sqlite = (db as any).session.client

  // Join vec_chunks (vector search) with document_chunks + documents to filter by project
  const results = sqlite.prepare(`
    SELECT
      vc.chunk_id,
      dc.content,
      vc.distance
    FROM vec_chunks vc
    JOIN document_chunks dc ON dc.id = vc.chunk_id
    JOIN documents d ON d.id = dc.document_id
    WHERE d.project_id = ?
      AND d.status = 'ready'
      AND vc.embedding MATCH ?
    ORDER BY vc.distance
    LIMIT ?
  `).all(projectId, new Float32Array(queryEmbedding), topK)

  return results as SearchResult[]
}

export function formatRagContext(results: SearchResult[]): string {
  if (results.length === 0) return ""
  let context = "Relevant information from project documents:\n"
  for (const r of results) {
    context += `---\n${r.content}\n`
  }
  return context.slice(0, 8000) // Hard cap at ~2000 tokens
}
```

**Step 3: Commit**

```bash
git add src/lib/rag/
git commit -m "feat: add document processing pipeline and vector search for RAG"
```

---

## Task 8: Document Upload API Route

**Files:**
- Create: `src/app/api/projects/[id]/documents/route.ts`
- Create: `src/app/api/projects/[id]/documents/[docId]/route.ts`

**Step 1: Create document list + upload route**

Create `src/app/api/projects/[id]/documents/route.ts`. The POST handler accepts multipart form data (file upload), validates file size (5 MB) and extension, saves the document with `status: "processing"`, then triggers `processDocument()` as fire-and-forget.

```typescript
import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { getProject } from "@/lib/projects"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"
import * as schema from "@/lib/db/schema"
import { processDocument } from "@/lib/rag/process"

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_EXTENSIONS = new Set([
  "txt", "md", "ts", "js", "py", "json", "yaml", "yml", "toml",
  "csv", "xml", "html", "css", "rs", "go", "java", "c", "cpp",
  "h", "sh", "sql", "env", "cfg", "ini", "log", "jsx", "tsx",
])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getDb()
    const docs = db.select().from(schema.documents)
      .where(eq(schema.documents.projectId, id))
      .all()
    return NextResponse.json(docs)
  } catch (error) {
    console.error("[documents] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const project = getProject(id)
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 })
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 })
    }

    const content = await file.text()
    const docId = ulid()
    const db = getDb()
    db.insert(schema.documents)
      .values({
        id: docId,
        projectId: id,
        name: file.name,
        content,
        status: "processing",
        createdAt: new Date(),
      })
      .run()

    // Fire-and-forget background processing
    processDocument(docId).catch((err) => {
      console.error("[documents] Background processing error:", err)
    })

    const doc = db.select().from(schema.documents).where(eq(schema.documents.id, docId)).get()
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error("[documents] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

**Step 2: Create document delete route**

Create `src/app/api/projects/[id]/documents/[docId]/route.ts` with a DELETE handler. Deleting a document cascades to `document_chunks` via FK. Also delete from `vec_chunks` explicitly (virtual tables don't cascade):

```typescript
sqlite.prepare("DELETE FROM vec_chunks WHERE chunk_id IN (SELECT id FROM document_chunks WHERE document_id = ?)").run(docId)
```

**Step 3: Verify build**

Run:
```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/app/api/projects/
git commit -m "feat: add document upload and delete API routes"
```

---

## Task 9: Wire RAG into Chat Route

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Step 1: Add RAG context injection**

In `src/app/api/chat/route.ts`, after the memory injection block and before the web search block, add:

```typescript
// Inject RAG document context for project conversations
if (conversationId) {
  const conversation = getConversation(conversationId)
  if (conversation?.projectId) {
    const project = getProject(conversation.projectId)
    // Inject project system prompt
    if (project?.systemPrompt) {
      systemPrompt = systemPrompt + "\n\n" + project.systemPrompt
    }
    // RAG: search project documents
    const ragModel = getSetting<{ provider: string; model: string }>("rag:model")
    if (ragModel?.provider && ragModel?.model) {
      try {
        const lastUserMsg = messages.filter(m => m.role === "user").pop()
        const query = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : ""
        if (query) {
          const results = await searchDocuments(conversation.projectId, query)
          const ragContext = formatRagContext(results)
          if (ragContext) {
            systemPrompt = systemPrompt + "\n\n" + ragContext
          }
        }
      } catch (err) {
        console.error("[chat] RAG search error:", err)
      }
    }
  }
}
```

Add imports at top:
```typescript
import { getProject } from "@/lib/projects"
import { searchDocuments, formatRagContext } from "@/lib/rag/search"
```

**Step 2: Verify build**

Run:
```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: wire RAG document context into chat route"
```

---

## Task 10: Auto-Title Conversations

**Files:**
- Create: `src/lib/conversations/auto-title.ts`
- Modify: `src/app/api/chat/route.ts`

**Step 1: Create auto-title function**

Create `src/lib/conversations/auto-title.ts`:

```typescript
import { generateText } from "ai"
import { getModel } from "@/lib/providers"
import { getSetting } from "@/lib/settings"
import { getConversation, updateConversation } from "@/lib/conversations"

type ModelConfig = { provider: string; model: string }

export async function autoTitleConversation(conversationId: string, userMessage: string, assistantMessage: string): Promise<void> {
  try {
    const conversation = getConversation(conversationId)
    if (!conversation) return

    // Only auto-title if title looks like the default truncated user message
    if (conversation.title.length >= 50 || conversation.title === "New Chat") {
      // skip — title was already customized or is still default
    } else if (conversation.title !== userMessage.slice(0, 50)) {
      return // Title was manually changed
    }

    const modelConfig = getSetting<ModelConfig>("memory:model")
    if (!modelConfig?.provider || !modelConfig?.model) return

    const model = getModel(modelConfig.provider, modelConfig.model)
    const { text } = await generateText({
      model,
      prompt: `Generate a concise title (3-6 words) for this conversation. Respond with only the title, no quotes or punctuation at the end.\n\nUser: ${userMessage.slice(0, 500)}\n\nAssistant: ${assistantMessage.slice(0, 500)}`,
      temperature: 0,
      maxOutputTokens: 30,
    })

    const title = text.trim().replace(/^["']|["']$/g, "").slice(0, 80)
    if (title) {
      updateConversation(conversationId, { title })
    }
  } catch (error) {
    console.error("[auto-title] Failed:", error)
  }
}
```

**Step 2: Wire into chat route onFinish**

In `src/app/api/chat/route.ts`, inside the `onFinish` callback, after `extractMemories()`, add:

```typescript
import { autoTitleConversation } from "@/lib/conversations/auto-title"

// Inside onFinish:
const firstUserMsg = messages.find(m => m.role === "user")
if (firstUserMsg && messages.filter(m => m.role === "assistant").length === 0) {
  // This is the first assistant response — auto-title
  const userText = typeof firstUserMsg.content === "string" ? firstUserMsg.content : ""
  autoTitleConversation(conversationId, userText, text).catch((err) => {
    console.error("[auto-title] Background error:", err)
  })
}
```

**Step 3: Commit**

```bash
git add src/lib/conversations/ src/app/api/chat/route.ts
git commit -m "feat: auto-title conversations after first assistant response"
```

---

## Task 11: Projects Hook and Sidebar Refactor

**Files:**
- Create: `src/hooks/use-projects.ts`
- Modify: `src/components/chat/chat-sidebar.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create useProjects hook**

Create `src/hooks/use-projects.ts` following the pattern of `src/hooks/use-conversations.ts`:

```typescript
"use client"
import { useState, useEffect, useCallback } from "react"

export type Project = {
  id: string
  name: string
  icon: string
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects")
      if (!res.ok) return
      setProjects(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const createProject = useCallback(async (data: { name?: string; icon?: string }) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const project: Project = await res.json()
    setProjects(prev => [project, ...prev])
    return project
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" })
    setProjects(prev => prev.filter(p => p.id !== id))
  }, [])

  const updateProject = useCallback(async (id: string, data: Partial<Pick<Project, "name" | "icon" | "systemPrompt">>) => {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    await fetchProjects()
  }, [fetchProjects])

  return { projects, createProject, deleteProject, updateProject, refresh: fetchProjects }
}
```

**Step 2: Refactor sidebar**

Modify `src/components/chat/chat-sidebar.tsx` to add a Projects section above the Chats section. Projects section shows each project with emoji + name. Add a [+] button next to the "PROJECTS" label. Chats section shows only standalone conversations (filter where `projectId` is null — the parent page passes these pre-filtered).

The sidebar needs new props: `projects`, `onSelectProject`, `onCreateProject`, `onDeleteProject`.

**Step 3: Update page.tsx**

Modify `src/app/page.tsx` to:
- Use `useProjects()` hook
- Track `activeProjectId` state alongside `activeId` (conversation)
- When `activeProjectId` is set, render `ProjectHome` instead of `ChatPanel`
- Pass projects + standalone conversations to the sidebar

**Step 4: Commit**

```bash
git add src/hooks/use-projects.ts src/components/chat/chat-sidebar.tsx src/app/page.tsx
git commit -m "feat: add projects to sidebar with projects/chats sections"
```

---

## Task 12: Project Home Page Component

**Files:**
- Create: `src/components/chat/project-home.tsx`

**Step 1: Build project home page**

Create `src/components/chat/project-home.tsx`. This component shows:
- Header with back arrow, emoji + project name, gear icon
- Chat input to start a new conversation
- Compact files section (filename chips with paperclip button)
- Recent conversations list

The file upload uses a hidden `<input type="file">` triggered by the paperclip button. Files are POSTed as `FormData` to `/api/projects/[id]/documents`.

Fetch documents from `/api/projects/[id]/documents` on mount.
Fetch project conversations from `/api/conversations?projectId=[id]` or from the parent.

**Step 2: Commit**

```bash
git add src/components/chat/project-home.tsx
git commit -m "feat: add project home page with files and conversations"
```

---

## Task 13: Project Settings Modal + Emoji Picker

**Files:**
- Create: `src/components/chat/project-settings.tsx`
- Create: `src/components/chat/emoji-picker.tsx`

**Step 1: Create emoji picker**

Create `src/components/chat/emoji-picker.tsx` — a simple grid of ~100 common emojis. Uses a `Popover` from shadcn. Returns the selected emoji string.

**Step 2: Create project settings modal**

Create `src/components/chat/project-settings.tsx` — a `Dialog` from shadcn with:
- Project name input
- Emoji picker button (shows current emoji, opens picker popover)
- System prompt textarea
- Save/Cancel buttons

Calls `updateProject()` on save.

**Step 3: Wire into project home page**

Import and render the settings modal from `project-home.tsx`, triggered by the gear icon.

**Step 4: Commit**

```bash
git add src/components/chat/project-settings.tsx src/components/chat/emoji-picker.tsx src/components/chat/project-home.tsx
git commit -m "feat: add project settings modal with emoji picker"
```

---

## Task 14: Mobile Swipe-to-Open Sidebar

**Files:**
- Create: `src/hooks/use-swipe-sidebar.ts`
- Modify: `src/app/page.tsx`

**Step 1: Create swipe hook**

Create `src/hooks/use-swipe-sidebar.ts`:

```typescript
"use client"
import { useEffect, useRef } from "react"

export function useSwipeSidebar(onOpen: () => void) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      // Only detect swipes starting from left edge (within 30px)
      if (touch.clientX < 30) {
        touchStart.current = { x: touch.clientX, y: touch.clientY }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStart.current.x
      const dy = Math.abs(touch.clientY - touchStart.current.y)
      touchStart.current = null
      // Swipe right > 50px, and mostly horizontal (not scrolling)
      if (dx > 50 && dy < dx) {
        onOpen()
      }
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true })
    document.addEventListener("touchend", handleTouchEnd, { passive: true })
    return () => {
      document.removeEventListener("touchstart", handleTouchStart)
      document.removeEventListener("touchend", handleTouchEnd)
    }
  }, [onOpen])
}
```

**Step 2: Wire into page.tsx**

In `src/app/page.tsx`, use the hook with the sidebar's `setOpen` function:

```typescript
import { useSwipeSidebar } from "@/hooks/use-swipe-sidebar"
import { useSidebar } from "@/components/ui/sidebar"

// Inside Home component:
const { setOpen } = useSidebar()
useSwipeSidebar(useCallback(() => setOpen(true), [setOpen]))
```

Note: `useSidebar()` must be called inside `SidebarProvider`. May need to extract the main content into a child component.

**Step 3: Test on mobile**

Open the PWA on mobile (or use Chrome DevTools mobile emulation). Swipe right from the left edge — sidebar should open.

**Step 4: Commit**

```bash
git add src/hooks/use-swipe-sidebar.ts src/app/page.tsx
git commit -m "feat: add swipe-to-open sidebar for mobile PWA"
```

---

## Task 15: RAG Settings UI

**Files:**
- Modify: `src/app/settings/page.tsx` or relevant settings component

**Step 1: Add embedding model picker**

In the Memory tab of the settings page (or as a new "Knowledge" section), add an embedding model picker using the same `ModelSelector` pattern as `memory:model`. Setting key: `rag:model`, value: `{ provider, model }`.

Suggested defaults to show in UI: OpenAI `text-embedding-3-small`, Google `text-embedding-004`, Mistral `mistral-embed`.

**Step 2: Commit**

```bash
git add src/app/settings/ src/components/settings/
git commit -m "feat: add RAG embedding model picker in settings"
```

---

## Task 16: Update Docker + CLAUDE.md

**Files:**
- Modify: `Dockerfile`
- Modify: `CLAUDE.md`

**Step 1: Update Dockerfile**

sqlite-vec is a native C extension. It may need additional build dependencies in the Docker `deps` stage. Verify the Docker build still works:

```bash
docker compose build
```

If sqlite-vec needs additional deps, add them to the `RUN apk add` line in the `deps` stage.

**Step 2: Update CLAUDE.md**

Add documentation for:
- Projects system (data model, API routes, sidebar layout)
- RAG pipeline (chunking, embedding, search, injection)
- Auto-title feature
- New settings keys (`rag:model`)
- New file structure (`src/lib/rag/`, `src/lib/projects.ts`)

**Step 3: Commit**

```bash
git add Dockerfile CLAUDE.md
git commit -m "docs: update CLAUDE.md and Dockerfile for projects + RAG"
```

---

## Summary

| Task | Description | Files |
|------|------------|-------|
| 1 | Schema + sqlite-vec setup | schema.ts, index.ts |
| 2 | Projects service layer | projects.ts + tests |
| 3 | Projects API routes | api/projects/ |
| 4 | Conversations projectId support | conversations.ts |
| 5 | Text chunker | rag/chunker.ts + tests |
| 6 | Embedding helper | rag/embeddings.ts, providers |
| 7 | Document processing + vector search | rag/process.ts, search.ts |
| 8 | Document upload API | api/projects/[id]/documents/ |
| 9 | Wire RAG into chat | chat/route.ts |
| 10 | Auto-title conversations | auto-title.ts, chat/route.ts |
| 11 | Projects hook + sidebar refactor | use-projects.ts, sidebar, page |
| 12 | Project home page | project-home.tsx |
| 13 | Project settings + emoji picker | project-settings.tsx, emoji-picker.tsx |
| 14 | Mobile swipe sidebar | use-swipe-sidebar.ts |
| 15 | RAG settings UI | settings page |
| 16 | Docker + CLAUDE.md update | Dockerfile, CLAUDE.md |
