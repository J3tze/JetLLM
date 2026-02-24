# JetLLM MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Phase 1 MVP — a multi-provider LLM chat interface with streaming, AMOLED-black theme, accent colors, conversation management, settings, and Docker deployment.

**Architecture:** Next.js 15 App Router with Vercel AI SDK v6 for unified multi-provider LLM streaming. SQLite via Drizzle ORM for persistence. shadcn/ui + Tailwind CSS v4 for the AMOLED-black UI with dynamic accent colors.

**Tech Stack:** Next.js 15, TypeScript, Vercel AI SDK 6, Drizzle ORM, better-sqlite3, shadcn/ui, Tailwind CSS v4, next-themes, Docker

**Design Doc:** `docs/plans/2026-02-24-jetllm-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `components.json`, `src/lib/utils.ts`, `src/components/theme-provider.tsx`

**Step 1: Create Next.js project**

Run:
```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Accept all defaults. This creates the base Next.js 15 project with Tailwind CSS v4.

**Step 2: Initialize shadcn/ui**

Run:
```bash
npx shadcn@latest init -y -b neutral
```

This creates `components.json`, `src/lib/utils.ts`, and updates `globals.css`.

**Step 3: Install core dependencies**

Run:
```bash
npm install next-themes ai @ai-sdk/react zod @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/mistral ulid
```

**Step 4: Install shadcn/ui components for MVP**

Run:
```bash
npx shadcn@latest add scroll-area textarea button avatar card separator dialog dropdown-menu sheet popover skeleton sonner tooltip select switch sidebar badge slider input label
```

If peer dependency errors occur, use `--legacy-peer-deps`.

**Step 5: Set up the AMOLED black theme**

Replace the `.dark` section in `src/app/globals.css` with AMOLED-black values. The key changes from default dark:

- `--background: oklch(0 0 0)` — pure black #000000
- `--card: oklch(0.075 0 0)` — very dark ~#111111
- `--secondary/muted/accent: oklch(0.15 0 0)` — ~#1a1a1a
- `--border: oklch(1 0 0 / 8%)` — subtle white border
- `--sidebar: oklch(0 0 0)` — pure black sidebar

Full `.dark` block:

```css
.dark {
  --background: oklch(0 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.075 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.075 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.145 0 0);
  --secondary: oklch(0.15 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.15 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.15 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.15 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.556 0 0);
}
```

**Step 6: Create theme provider**

Create `src/components/theme-provider.tsx`:

```tsx
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

**Step 7: Update root layout**

Update `src/app/layout.tsx` to wrap with ThemeProvider, default to dark:

```tsx
import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "JetLLM",
  description: "A sleek, feature-rich LLM web UI",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

**Step 8: Verify the app runs**

Run: `npm run dev`

Expected: App starts at http://localhost:3000 with a pure black background.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with shadcn/ui and AMOLED theme"
```

---

## Task 2: Database Schema & Connection

**Files:**
- Create: `src/lib/db/index.ts`, `src/lib/db/schema.ts`, `drizzle.config.ts`
- Create: `data/` directory (gitignored)

**Step 1: Install database dependencies**

Run:
```bash
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3
```

**Step 2: Create the Drizzle schema**

Create `src/lib/db/schema.ts`:

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Chat"),
  model: text("model").notNull(),
  provider: text("provider").notNull(),
  systemPrompt: text("system_prompt"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})
```

**Step 3: Create the database connection singleton**

Create `src/lib/db/index.ts`:

```typescript
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"
import * as schema from "./schema"
import path from "path"

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "jetllm.db")

let db: BetterSQLite3Database<typeof schema>

export function getDb() {
  if (!db) {
    const sqlite = new Database(DB_PATH)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    db = drizzle({ client: sqlite, schema })
  }
  return db
}

export { schema }
```

**Step 4: Create drizzle.config.ts**

Create `drizzle.config.ts` in project root:

```typescript
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "./data/jetllm.db",
  },
})
```

**Step 5: Add database scripts to package.json**

Add to the `"scripts"` section of `package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

**Step 6: Create data directory and gitignore it**

Run:
```bash
mkdir -p data
```

Add to `.gitignore`:
```
data/
```

**Step 7: Generate and push initial schema**

Run:
```bash
npx drizzle-kit push
```

Expected: Schema pushed to `data/jetllm.db` successfully.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle ORM schema with SQLite for conversations, messages, and settings"
```

---

## Task 3: Settings API (Provider Configuration)

**Files:**
- Create: `src/lib/settings.ts`
- Create: `src/app/api/settings/route.ts`

**Step 1: Create the settings service**

Create `src/lib/settings.ts`:

```typescript
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

export type ProviderConfig = {
  apiKey: string
  baseUrl?: string
  models?: string[]
}

export type ProviderSettings = {
  [provider: string]: ProviderConfig
}

export function getSetting<T = string>(key: string): T | null {
  const db = getDb()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return row.value as T
  }
}

export function setSetting(key: string, value: unknown): void {
  const db = getDb()
  const serialized = typeof value === "string" ? value : JSON.stringify(value)
  db.insert(schema.settings)
    .values({ key, value: serialized })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: serialized } })
    .run()
}

export function deleteSetting(key: string): void {
  const db = getDb()
  db.delete(schema.settings).where(eq(schema.settings.key, key)).run()
}

export function getAllSettings(): Record<string, unknown> {
  const db = getDb()
  const rows = db.select().from(schema.settings).all()
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value)
    } catch {
      result[row.key] = row.value
    }
  }
  return result
}
```

**Step 2: Create the settings API route**

Create `src/app/api/settings/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getSetting, setSetting, getAllSettings } from "@/lib/settings"

export async function GET() {
  const settings = getAllSettings()
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { key, value } = body

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 })
  }

  setSetting(key, value)
  return NextResponse.json({ success: true })
}
```

**Step 3: Verify the API works**

Run: `npm run dev`

Test with curl:
```bash
curl -X PUT http://localhost:3000/api/settings -H "Content-Type: application/json" -d '{"key":"test","value":"hello"}'
curl http://localhost:3000/api/settings
```

Expected: Settings are stored and retrieved correctly.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add settings service and API for provider configuration"
```

---

## Task 4: Provider System

**Files:**
- Create: `src/lib/providers/index.ts`
- Create: `src/lib/providers/registry.ts`

**Step 1: Create the provider registry**

Create `src/lib/providers/registry.ts`:

```typescript
export type ProviderDef = {
  id: string
  name: string
  sdkPackage: string
  defaultModels: string[]
  supportsCustomBase: boolean
}

export const PROVIDER_REGISTRY: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini"],
    supportsCustomBase: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    sdkPackage: "@ai-sdk/anthropic",
    defaultModels: [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-20250414",
      "claude-3-5-sonnet-20241022",
    ],
    supportsCustomBase: true,
  },
  {
    id: "google",
    name: "Google Gemini",
    sdkPackage: "@ai-sdk/google",
    defaultModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    supportsCustomBase: false,
  },
  {
    id: "mistral",
    name: "Mistral",
    sdkPackage: "@ai-sdk/mistral",
    defaultModels: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
    supportsCustomBase: false,
  },
  {
    id: "groq",
    name: "Groq",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    supportsCustomBase: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: [],
    supportsCustomBase: true,
  },
  {
    id: "together",
    name: "Together AI",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: [],
    supportsCustomBase: true,
  },
  {
    id: "custom",
    name: "Custom (OpenAI-Compatible)",
    sdkPackage: "@ai-sdk/openai",
    defaultModels: [],
    supportsCustomBase: true,
  },
]
```

**Step 2: Create the provider factory**

Create `src/lib/providers/index.ts`:

```typescript
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createMistral } from "@ai-sdk/mistral"
import { getSetting, ProviderConfig } from "@/lib/settings"
import { LanguageModelV1 } from "ai"

const PROVIDER_BASE_URLS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
}

export function getModel(providerId: string, modelId: string): LanguageModelV1 {
  const config = getSetting<ProviderConfig>(`provider:${providerId}`)
  if (!config?.apiKey) {
    throw new Error(`No API key configured for provider: ${providerId}`)
  }

  switch (providerId) {
    case "openai": {
      const provider = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl }),
      })
      return provider(modelId)
    }
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl }),
      })
      return provider(modelId)
    }
    case "google": {
      const provider = createGoogleGenerativeAI({
        apiKey: config.apiKey,
      })
      return provider(modelId)
    }
    case "mistral": {
      const provider = createMistral({
        apiKey: config.apiKey,
      })
      return provider(modelId)
    }
    case "groq":
    case "openrouter":
    case "together":
    case "custom": {
      const baseURL = config.baseUrl || PROVIDER_BASE_URLS[providerId]
      if (!baseURL) {
        throw new Error(`Base URL required for provider: ${providerId}`)
      }
      const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL,
      })
      return provider(modelId)
    }
    default:
      throw new Error(`Unknown provider: ${providerId}`)
  }
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add provider registry and factory for multi-provider LLM support"
```

---

## Task 5: Conversations API

**Files:**
- Create: `src/lib/conversations.ts`
- Create: `src/app/api/conversations/route.ts`
- Create: `src/app/api/conversations/[id]/route.ts`
- Create: `src/app/api/conversations/[id]/messages/route.ts`

**Step 1: Create the conversations service**

Create `src/lib/conversations.ts`:

```typescript
import { getDb, schema } from "@/lib/db"
import { eq, desc } from "drizzle-orm"
import { ulid } from "ulid"

export type Conversation = typeof schema.conversations.$inferSelect
export type Message = typeof schema.messages.$inferSelect

export function createConversation(data: {
  model: string
  provider: string
  title?: string
  systemPrompt?: string
}): Conversation {
  const db = getDb()
  const id = ulid()
  const now = new Date()

  db.insert(schema.conversations)
    .values({
      id,
      title: data.title || "New Chat",
      model: data.model,
      provider: data.provider,
      systemPrompt: data.systemPrompt || null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get()!
}

export function listConversations(): Conversation[] {
  const db = getDb()
  return db
    .select()
    .from(schema.conversations)
    .orderBy(desc(schema.conversations.updatedAt))
    .all()
}

export function getConversation(id: string): Conversation | undefined {
  const db = getDb()
  return db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get()
}

export function updateConversation(
  id: string,
  data: Partial<{ title: string; model: string; provider: string; systemPrompt: string | null }>
): void {
  const db = getDb()
  db.update(schema.conversations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.conversations.id, id))
    .run()
}

export function deleteConversation(id: string): void {
  const db = getDb()
  db.delete(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .run()
}

export function getMessages(conversationId: string): Message[] {
  const db = getDb()
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.createdAt)
    .all()
}

export function addMessage(data: {
  conversationId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  toolCalls?: string
  metadata?: string
}): Message {
  const db = getDb()
  const id = ulid()

  db.insert(schema.messages)
    .values({
      id,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      toolCalls: data.toolCalls || null,
      metadata: data.metadata || null,
      createdAt: new Date(),
    })
    .run()

  // Update conversation's updatedAt
  db.update(schema.conversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.conversations.id, data.conversationId))
    .run()

  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, id))
    .get()!
}
```

**Step 2: Create the conversations list/create API**

Create `src/app/api/conversations/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { listConversations, createConversation } from "@/lib/conversations"

export async function GET() {
  const conversations = listConversations()
  return NextResponse.json(conversations)
}

export async function POST(request: Request) {
  const body = await request.json()
  const { model, provider, title, systemPrompt } = body

  if (!model || !provider) {
    return NextResponse.json(
      { error: "model and provider are required" },
      { status: 400 }
    )
  }

  const conversation = createConversation({ model, provider, title, systemPrompt })
  return NextResponse.json(conversation, { status: 201 })
}
```

**Step 3: Create the single conversation API**

Create `src/app/api/conversations/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server"
import {
  getConversation,
  updateConversation,
  deleteConversation,
} from "@/lib/conversations"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conversation = getConversation(id)
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json(conversation)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  updateConversation(id, body)
  const updated = getConversation(id)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  deleteConversation(id)
  return NextResponse.json({ success: true })
}
```

**Step 4: Create the messages API**

Create `src/app/api/conversations/[id]/messages/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getMessages } from "@/lib/conversations"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const messages = getMessages(id)
  return NextResponse.json(messages)
}
```

**Step 5: Verify the APIs work**

Run: `npm run dev`

Test with curl:
```bash
curl -X POST http://localhost:3000/api/conversations -H "Content-Type: application/json" -d '{"model":"gpt-4o","provider":"openai"}'
curl http://localhost:3000/api/conversations
```

Expected: Conversation created and listed successfully.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add conversations and messages API with CRUD operations"
```

---

## Task 6: Chat API (Streaming)

**Files:**
- Create: `src/app/api/chat/route.ts`

**Step 1: Create the chat streaming endpoint**

Create `src/app/api/chat/route.ts`:

```typescript
import { streamText, UIMessage, convertToModelMessages } from "ai"
import { getModel } from "@/lib/providers"
import { addMessage, getConversation } from "@/lib/conversations"

export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json()
  const {
    messages,
    conversationId,
    provider,
    model: modelId,
    temperature,
    maxTokens,
    topP,
  } = body as {
    messages: UIMessage[]
    conversationId?: string
    provider: string
    model: string
    temperature?: number
    maxTokens?: number
    topP?: number
  }

  // Get conversation-level system prompt if available
  let systemPrompt = "You are a helpful AI assistant."
  if (conversationId) {
    const conversation = getConversation(conversationId)
    if (conversation?.systemPrompt) {
      systemPrompt = conversation.systemPrompt
    }
  }

  const llmModel = getModel(provider, modelId)

  const result = streamText({
    model: llmModel,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    temperature: temperature ?? 0.7,
    maxTokens: maxTokens ?? 4096,
    topP: topP ?? 1,
    onFinish: async ({ text }) => {
      if (conversationId && text) {
        // Save the assistant message to DB
        addMessage({
          conversationId,
          role: "assistant",
          content: text,
        })
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add streaming chat API endpoint with multi-provider support"
```

---

## Task 7: Chat UI — Sidebar

**Files:**
- Create: `src/components/chat/chat-sidebar.tsx`
- Create: `src/hooks/use-conversations.ts`

**Step 1: Create the conversations hook**

Create `src/hooks/use-conversations.ts`:

```typescript
"use client"

import { useState, useEffect, useCallback } from "react"

export type Conversation = {
  id: string
  title: string
  model: string
  provider: string
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations")
      const data = await res.json()
      setConversations(data)
    } catch (error) {
      console.error("Failed to fetch conversations:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const createConversation = async (data: {
    model: string
    provider: string
    title?: string
  }): Promise<Conversation> => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const conversation = await res.json()
    setConversations((prev) => [conversation, ...prev])
    return conversation
  }

  const deleteConversation = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" })
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }

  const updateConversation = async (
    id: string,
    data: Partial<Conversation>
  ) => {
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const updated = await res.json()
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? updated : c))
    )
  }

  return {
    conversations,
    loading,
    createConversation,
    deleteConversation,
    updateConversation,
    refresh: fetchConversations,
  }
}
```

**Step 2: Create the sidebar component**

Create `src/components/chat/chat-sidebar.tsx`:

```tsx
"use client"

import { Plus, Trash2, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { Conversation } from "@/hooks/use-conversations"

type ChatSidebarProps = {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ChatSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">JetLLM</h1>
          <Button variant="ghost" size="icon" onClick={onNew}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="flex-1">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {conversations.map((conv) => (
                  <SidebarMenuItem key={conv.id}>
                    <SidebarMenuButton
                      isActive={conv.id === activeId}
                      onClick={() => onSelect(conv.id)}
                      className="group justify-between"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span className="truncate">{conv.title}</span>
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(conv.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-4">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => (window.location.href = "/settings")}
        >
          Settings
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add conversation sidebar with create, select, and delete"
```

---

## Task 8: Chat UI — Message List & Input

**Files:**
- Create: `src/components/chat/message-list.tsx`
- Create: `src/components/chat/chat-input.tsx`
- Create: `src/components/chat/chat-message.tsx`

**Step 1: Create the message bubble component**

Create `src/components/chat/chat-message.tsx`:

```tsx
"use client"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { User, Bot } from "lucide-react"

type ChatMessageProps = {
  role: "user" | "assistant"
  children: React.ReactNode
}

export function ChatMessage({ role, children }: ChatMessageProps) {
  const isUser = role === "user"

  return (
    <div className={cn("flex gap-3 py-4 px-4", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(isUser ? "bg-primary text-primary-foreground" : "bg-secondary")}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground"
        )}
      >
        {children}
      </div>
    </div>
  )
}
```

**Step 2: Create the message list component**

Create `src/components/chat/message-list.tsx`:

```tsx
"use client"

import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatMessage } from "./chat-message"
import type { UIMessage } from "ai"

type MessageListProps = {
  messages: UIMessage[]
  isLoading?: boolean
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-2xl font-semibold mb-2">JetLLM</p>
          <p className="text-sm">Start a conversation</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-3xl mx-auto py-4">
        {messages.map((message) => {
          if (message.role !== "user" && message.role !== "assistant") return null
          return (
            <ChatMessage key={message.id} role={message.role}>
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return <span key={i}>{part.text}</span>
                }
                return null
              })}
            </ChatMessage>
          )
        })}
        {isLoading && (
          <ChatMessage role="assistant">
            <span className="animate-pulse">Thinking...</span>
          </ChatMessage>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
```

**Step 3: Create the chat input component**

Create `src/components/chat/chat-input.tsx`:

```tsx
"use client"

import { useState, useRef, useCallback } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { SendHorizontal } from "lucide-react"

type ChatInputProps = {
  onSend: (text: string) => void
  isLoading?: boolean
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setValue("")
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, isLoading, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border p-4">
      <div className="max-w-3xl mx-auto flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="min-h-[44px] max-h-[200px] resize-none bg-card"
          rows={1}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = "auto"
            target.style.height = `${target.scrollHeight}px`
          }}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!value.trim() || isLoading}
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add chat message list, message bubble, and input components"
```

---

## Task 9: Chat UI — Main Chat Page (Wiring It Together)

**Files:**
- Create: `src/components/chat/chat-panel.tsx`
- Create: `src/components/chat/model-selector.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create the model selector component**

Create `src/components/chat/model-selector.tsx`:

```tsx
"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"

type ModelSelectorProps = {
  provider: string
  model: string
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
}

export function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
}: ModelSelectorProps) {
  const providerDef = PROVIDER_REGISTRY.find((p) => p.id === provider)
  const models = providerDef?.defaultModels || []

  return (
    <div className="flex gap-2 items-center">
      <Select value={provider} onValueChange={onProviderChange}>
        <SelectTrigger className="w-[140px] h-8 text-xs bg-card">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          {PROVIDER_REGISTRY.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={model} onValueChange={onModelChange}>
        <SelectTrigger className="w-[200px] h-8 text-xs bg-card">
          <SelectValue placeholder="Model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

**Step 2: Create the chat panel (brings everything together)**

Create `src/components/chat/chat-panel.tsx`:

```tsx
"use client"

import { useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { MessageList } from "./message-list"
import { ChatInput } from "./chat-input"
import { ModelSelector } from "./model-selector"
import { addMessage } from "./actions"

type ChatPanelProps = {
  conversationId: string | null
  onConversationCreated?: (id: string) => void
}

export function ChatPanel({ conversationId, onConversationCreated }: ChatPanelProps) {
  const [provider, setProvider] = useState("openai")
  const [model, setModel] = useState("gpt-4o")

  const { messages, sendMessage, status } = useChat({
    id: conversationId || undefined,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        conversationId,
        provider,
        model,
      },
    }),
  })

  const isLoading = status === "streaming" || status === "submitted"

  const handleSend = useCallback(
    async (text: string) => {
      let activeConvId = conversationId

      // Create conversation on first message if none exists
      if (!activeConvId) {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            provider,
            title: text.slice(0, 50),
          }),
        })
        const conv = await res.json()
        activeConvId = conv.id
        onConversationCreated?.(conv.id)
      }

      // Save user message to DB
      await fetch(`/api/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: text }),
      })

      sendMessage({ text })
    },
    [conversationId, model, provider, sendMessage, onConversationCreated]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-4 py-2 flex items-center justify-between">
        <ModelSelector
          provider={provider}
          model={model}
          onProviderChange={(p) => {
            setProvider(p)
            // Reset model when provider changes
            const providerModels = require("@/lib/providers/registry").PROVIDER_REGISTRY
              .find((pr: any) => pr.id === p)?.defaultModels
            if (providerModels?.[0]) setModel(providerModels[0])
          }}
          onModelChange={setModel}
        />
      </div>
      <MessageList messages={messages} isLoading={isLoading} />
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  )
}
```

**Step 3: Create server action for saving messages**

Create `src/app/api/conversations/[id]/messages/route.ts` — update it to support POST:

Add to the existing file `src/app/api/conversations/[id]/messages/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getMessages, addMessage } from "@/lib/conversations"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const messages = getMessages(id)
  return NextResponse.json(messages)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const message = addMessage({
    conversationId: id,
    role: body.role,
    content: body.content,
  })
  return NextResponse.json(message, { status: 201 })
}
```

**Step 4: Wire up the main page**

Replace `src/app/page.tsx`:

```tsx
"use client"

import { useState } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatPanel } from "@/components/chat/chat-panel"
import { useConversations } from "@/hooks/use-conversations"

export default function Home() {
  const {
    conversations,
    createConversation,
    deleteConversation,
    refresh,
  } = useConversations()
  const [activeId, setActiveId] = useState<string | null>(null)

  const handleNew = () => {
    setActiveId(null)
  }

  const handleConversationCreated = (id: string) => {
    setActiveId(id)
    refresh()
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNew}
          onDelete={async (id) => {
            await deleteConversation(id)
            if (activeId === id) setActiveId(null)
          }}
        />
        <main className="flex-1 flex flex-col">
          <ChatPanel
            key={activeId}
            conversationId={activeId}
            onConversationCreated={handleConversationCreated}
          />
        </main>
      </div>
    </SidebarProvider>
  )
}
```

**Step 5: Verify the app runs**

Run: `npm run dev`

Expected: Full chat UI visible with sidebar, model selector, message list, and input. The chat won't stream responses yet (no API key configured), but the UI should render correctly.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire up chat panel with sidebar, model selector, and message display"
```

---

## Task 10: Settings Page

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/layout.tsx`
- Create: `src/components/settings/provider-settings.tsx`

**Step 1: Create the settings layout**

Create `src/app/settings/layout.tsx`:

```tsx
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Settings</h1>
      </header>
      <main className="max-w-2xl mx-auto p-6">{children}</main>
    </div>
  )
}
```

**Step 2: Create the provider settings component**

Create `src/components/settings/provider-settings.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"
import { toast } from "sonner"
import { Eye, EyeOff } from "lucide-react"

type ProviderConfig = {
  apiKey: string
  baseUrl?: string
}

export function ProviderSettings() {
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((settings) => {
        const providerConfigs: Record<string, ProviderConfig> = {}
        for (const provider of PROVIDER_REGISTRY) {
          const key = `provider:${provider.id}`
          if (settings[key]) {
            providerConfigs[provider.id] = settings[key] as ProviderConfig
          } else {
            providerConfigs[provider.id] = { apiKey: "" }
          }
        }
        setConfigs(providerConfigs)
      })
  }, [])

  const updateConfig = (providerId: string, field: keyof ProviderConfig, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], [field]: value },
    }))
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      for (const [providerId, config] of Object.entries(configs)) {
        if (config.apiKey) {
          await fetch("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: `provider:${providerId}`,
              value: config,
            }),
          })
        }
      }
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {PROVIDER_REGISTRY.map((provider) => (
        <Card key={provider.id}>
          <CardHeader>
            <CardTitle className="text-base">{provider.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${provider.id}-key`}>API Key</Label>
              <div className="relative">
                <Input
                  id={`${provider.id}-key`}
                  type={showKeys[provider.id] ? "text" : "password"}
                  value={configs[provider.id]?.apiKey || ""}
                  onChange={(e) =>
                    updateConfig(provider.id, "apiKey", e.target.value)
                  }
                  placeholder={`Enter ${provider.name} API key`}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowKeys((prev) => ({
                      ...prev,
                      [provider.id]: !prev[provider.id],
                    }))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showKeys[provider.id] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {provider.supportsCustomBase && (
              <div className="space-y-1.5">
                <Label htmlFor={`${provider.id}-url`}>
                  Base URL <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id={`${provider.id}-url`}
                  value={configs[provider.id]?.baseUrl || ""}
                  onChange={(e) =>
                    updateConfig(provider.id, "baseUrl", e.target.value)
                  }
                  placeholder="https://api.example.com/v1"
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      <Button onClick={saveAll} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save All Settings"}
      </Button>
    </div>
  )
}
```

**Step 3: Create the settings page**

Create `src/app/settings/page.tsx`:

```tsx
import { ProviderSettings } from "@/components/settings/provider-settings"

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">LLM Providers</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Configure API keys for the LLM providers you want to use.
        </p>
        <ProviderSettings />
      </section>
    </div>
  )
}
```

**Step 4: Verify settings page**

Run: `npm run dev`

Navigate to http://localhost:3000/settings

Expected: Settings page shows all providers with API key inputs and optional base URL fields.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add settings page with provider API key configuration"
```

---

## Task 11: Accent Color System

**Files:**
- Create: `src/components/settings/accent-color-picker.tsx`
- Create: `src/hooks/use-accent-color.ts`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Step 1: Create the accent color hook**

Create `src/hooks/use-accent-color.ts`:

```typescript
"use client"

import { useState, useEffect, useCallback } from "react"

export const ACCENT_PRESETS = [
  { name: "Blue", hsl: "220 90% 56%", hex: "#3b82f6" },
  { name: "Purple", hsl: "270 76% 53%", hex: "#8b5cf6" },
  { name: "Green", hsl: "142 71% 45%", hex: "#22c55e" },
  { name: "Red", hsl: "0 84% 60%", hex: "#ef4444" },
  { name: "Orange", hsl: "25 95% 53%", hex: "#f97316" },
  { name: "Pink", hsl: "330 81% 60%", hex: "#ec4899" },
  { name: "Cyan", hsl: "188 94% 43%", hex: "#06b6d4" },
] as const

const DEFAULT_ACCENT = ACCENT_PRESETS[0]

export function useAccentColor() {
  const [accent, setAccentState] = useState(DEFAULT_ACCENT)

  useEffect(() => {
    // Load saved accent from settings API
    fetch("/api/settings")
      .then((res) => res.json())
      .then((settings) => {
        if (settings["ui:accentColor"]) {
          const saved = settings["ui:accentColor"]
          const preset = ACCENT_PRESETS.find((p) => p.name === saved.name)
          if (preset) {
            setAccentState(preset)
            applyAccent(preset.hsl)
          }
        } else {
          applyAccent(DEFAULT_ACCENT.hsl)
        }
      })
  }, [])

  const setAccent = useCallback(
    (preset: (typeof ACCENT_PRESETS)[number]) => {
      setAccentState(preset)
      applyAccent(preset.hsl)
      // Persist
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "ui:accentColor",
          value: { name: preset.name, hsl: preset.hsl },
        }),
      })
    },
    []
  )

  return { accent, setAccent, presets: ACCENT_PRESETS }
}

function applyAccent(hsl: string) {
  document.documentElement.style.setProperty("--accent-color", hsl)
}
```

**Step 2: Add accent color CSS variables**

Add to the bottom of `src/app/globals.css`, before the `@layer base` block:

```css
/* Dynamic accent color override */
:root {
  --accent-color: 220 90% 56%;
}

.dark {
  /* Override the neutral accent with the dynamic accent color */
  --sidebar-primary: hsl(var(--accent-color));
  --ring: hsl(var(--accent-color));
}
```

Note: This approach overrides specific variables with the accent. The `--accent-color` custom property is set dynamically via JS.

**Step 3: Create the accent color picker component**

Create `src/components/settings/accent-color-picker.tsx`:

```tsx
"use client"

import { useAccentColor } from "@/hooks/use-accent-color"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function AccentColorPicker() {
  const { accent, setAccent, presets } = useAccentColor()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accent Color</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 flex-wrap">
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => setAccent(preset)}
              className={cn(
                "w-10 h-10 rounded-full border-2 transition-all",
                accent.name === preset.name
                  ? "border-foreground scale-110"
                  : "border-transparent hover:scale-105"
              )}
              style={{ backgroundColor: preset.hex }}
              title={preset.name}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 4: Add accent color picker to settings page**

Update `src/app/settings/page.tsx` to include the accent color section:

```tsx
import { ProviderSettings } from "@/components/settings/provider-settings"
import { AccentColorPicker } from "@/components/settings/accent-color-picker"

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">Appearance</h2>
        <AccentColorPicker />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-4">LLM Providers</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Configure API keys for the LLM providers you want to use.
        </p>
        <ProviderSettings />
      </section>
    </div>
  )
}
```

**Step 5: Verify accent colors work**

Run: `npm run dev`

Navigate to settings, click different accent colors. Active elements should change color.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add dynamic accent color system with presets"
```

---

## Task 12: Parameter Controls

**Files:**
- Create: `src/components/chat/parameter-popover.tsx`
- Modify: `src/components/chat/chat-panel.tsx`

**Step 1: Create parameter popover**

Create `src/components/chat/parameter-popover.tsx`:

```tsx
"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Settings2 } from "lucide-react"

type ParameterPopoverProps = {
  temperature: number
  maxTokens: number
  topP: number
  onTemperatureChange: (value: number) => void
  onMaxTokensChange: (value: number) => void
  onTopPChange: (value: number) => void
}

export function ParameterPopover({
  temperature,
  maxTokens,
  topP,
  onTemperatureChange,
  onMaxTokensChange,
  onTopPChange,
}: ParameterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Temperature</Label>
              <span className="text-xs text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={([v]) => onTemperatureChange(v)}
              min={0}
              max={2}
              step={0.1}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Max Tokens</Label>
              <span className="text-xs text-muted-foreground">{maxTokens}</span>
            </div>
            <Slider
              value={[maxTokens]}
              onValueChange={([v]) => onMaxTokensChange(v)}
              min={256}
              max={16384}
              step={256}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Top P</Label>
              <span className="text-xs text-muted-foreground">{topP.toFixed(2)}</span>
            </div>
            <Slider
              value={[topP]}
              onValueChange={([v]) => onTopPChange(v)}
              min={0}
              max={1}
              step={0.05}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

**Step 2: Add parameter controls to chat panel header**

Update the header section of `src/components/chat/chat-panel.tsx` to include the parameter popover. Add state for `temperature`, `maxTokens`, `topP` and pass them to both the popover and the transport body.

**Step 3: Verify parameter controls**

Run: `npm run dev`

Expected: Gear icon in chat header opens a popover with temperature, max tokens, and top P sliders.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add parameter controls (temperature, max tokens, top P) to chat header"
```

---

## Task 13: Docker Deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Step 1: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
.next
.git
data
*.md
```

**Step 2: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

**Step 3: Add standalone output to next.config**

In `next.config.ts` (or `next.config.mjs`), add:

```typescript
const nextConfig = {
  output: "standalone",
}
```

**Step 4: Create docker-compose.yml**

Create `docker-compose.yml`:

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
      - DB_PATH=/app/data/jetllm.db
    restart: unless-stopped

volumes:
  jetllm-data:
```

**Step 5: Test Docker build**

Run:
```bash
docker compose build
docker compose up
```

Expected: App accessible at http://localhost:3000 with persistent data in Docker volume.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Dockerfile and docker-compose for production deployment"
```

---

## Task 14: End-to-End Smoke Test

**Step 1: Verify complete flow**

1. Run `npm run dev`
2. Navigate to http://localhost:3000/settings
3. Enter an API key for at least one provider (e.g., OpenAI)
4. Click "Save All Settings"
5. Navigate back to http://localhost:3000
6. Select the configured provider and a model
7. Type a message and send
8. Verify: streaming response appears in the chat
9. Verify: conversation appears in sidebar
10. Verify: clicking the conversation in sidebar reloads it
11. Verify: deleting the conversation removes it

**Step 2: Fix any issues found during smoke test**

Address any bugs encountered during the flow above.

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: address smoke test issues"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | Project scaffolding + AMOLED theme | 9 steps |
| 2 | Database schema + connection | 8 steps |
| 3 | Settings API | 4 steps |
| 4 | Provider system | 3 steps |
| 5 | Conversations API | 6 steps |
| 6 | Chat streaming API | 2 steps |
| 7 | Sidebar component | 3 steps |
| 8 | Message list + input | 4 steps |
| 9 | Main chat page (wiring) | 6 steps |
| 10 | Settings page | 5 steps |
| 11 | Accent color system | 6 steps |
| 12 | Parameter controls | 4 steps |
| 13 | Docker deployment | 6 steps |
| 14 | End-to-end smoke test | 3 steps |

**Total: 14 tasks, ~69 steps**

Each task ends with a commit. The result is a fully functional MVP with multi-provider streaming chat, AMOLED theme, accent colors, conversation management, settings, parameter controls, and Docker deployment.
