import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { sql } from "drizzle-orm"
import * as schema from "../schema"

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle({ client: sqlite, schema })

  // Create tables manually for in-memory DB
  sqlite.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      system_prompt TEXT,
      project_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return { db, sqlite }
}

describe("Database Schema", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let sqlite: Database.Database

  beforeEach(() => {
    const result = createTestDb()
    db = result.db
    sqlite = result.sqlite
  })

  afterEach(() => {
    sqlite.close()
  })

  describe("conversations table", () => {
    it("inserts and retrieves a conversation", () => {
      db.insert(schema.conversations)
        .values({
          id: "01ABC",
          model: "gpt-4o",
          provider: "openai",
        })
        .run()

      const rows = db.select().from(schema.conversations).all()
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe("01ABC")
      expect(rows[0].title).toBe("New Chat")
      expect(rows[0].model).toBe("gpt-4o")
      expect(rows[0].provider).toBe("openai")
      expect(rows[0].createdAt).toBeInstanceOf(Date)
    })

    it("stores optional system prompt", () => {
      db.insert(schema.conversations)
        .values({
          id: "01DEF",
          model: "claude-sonnet-4-20250514",
          provider: "anthropic",
          systemPrompt: "You are a coding assistant.",
        })
        .run()

      const row = db
        .select()
        .from(schema.conversations)
        .where(sql`id = '01DEF'`)
        .get()

      expect(row?.systemPrompt).toBe("You are a coding assistant.")
    })
  })

  describe("messages table", () => {
    it("inserts a message linked to a conversation", () => {
      db.insert(schema.conversations)
        .values({ id: "conv1", model: "gpt-4o", provider: "openai" })
        .run()

      db.insert(schema.messages)
        .values({
          id: "msg1",
          conversationId: "conv1",
          role: "user",
          content: "Hello!",
        })
        .run()

      const rows = db.select().from(schema.messages).all()
      expect(rows).toHaveLength(1)
      expect(rows[0].conversationId).toBe("conv1")
      expect(rows[0].role).toBe("user")
      expect(rows[0].content).toBe("Hello!")
    })

    it("cascades deletes from conversation to messages", () => {
      db.insert(schema.conversations)
        .values({ id: "conv2", model: "gpt-4o", provider: "openai" })
        .run()

      db.insert(schema.messages)
        .values({
          id: "msg2",
          conversationId: "conv2",
          role: "assistant",
          content: "Hi there!",
        })
        .run()

      db.delete(schema.conversations)
        .where(sql`id = 'conv2'`)
        .run()

      const messages = db.select().from(schema.messages).all()
      expect(messages).toHaveLength(0)
    })
  })

  describe("settings table", () => {
    it("inserts and retrieves a setting", () => {
      db.insert(schema.settings)
        .values({ key: "theme", value: JSON.stringify({ accent: "blue" }) })
        .run()

      const row = db
        .select()
        .from(schema.settings)
        .where(sql`key = 'theme'`)
        .get()

      expect(row?.value).toBe('{"accent":"blue"}')
    })

    it("upserts on conflict", () => {
      db.insert(schema.settings)
        .values({ key: "theme", value: "dark" })
        .run()

      db.insert(schema.settings)
        .values({ key: "theme", value: "light" })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: "light" },
        })
        .run()

      const rows = db.select().from(schema.settings).all()
      expect(rows).toHaveLength(1)
      expect(rows[0].value).toBe("light")
    })
  })
})
