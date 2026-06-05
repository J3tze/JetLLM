import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../db/schema"
import { createMemoryService } from "../memory"
import { createConversationsService } from "../conversations"

const USER_ID = "user-1"
const OTHER_USER_ID = "user-2"

type RawMemoryService = ReturnType<typeof createMemoryService>
type RawConversationsService = ReturnType<typeof createConversationsService>
type OwnedMemoryService = {
  create(data: Omit<Parameters<RawMemoryService["create"]>[0], "userId">): ReturnType<RawMemoryService["create"]>
  list(): ReturnType<RawMemoryService["list"]>
  get(id: string): ReturnType<RawMemoryService["get"]>
  update(id: string, data: Parameters<RawMemoryService["update"]>[2]): ReturnType<RawMemoryService["update"]>
  delete(id: string): ReturnType<RawMemoryService["delete"]>
  existsByContent(content: string): ReturnType<RawMemoryService["existsByContent"]>
  getFormattedForInjection(maxChars?: number): ReturnType<RawMemoryService["getFormattedForInjection"]>
}
type OwnedConversationsService = {
  create(data: Omit<Parameters<RawConversationsService["create"]>[0], "userId">): ReturnType<RawConversationsService["create"]>
  delete(id: string): ReturnType<RawConversationsService["delete"]>
}

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle({ client: sqlite, schema })

  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New Chat',
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      system_prompt TEXT,
      project_id TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'summary')),
      content TEXT NOT NULL,
      source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at)
    VALUES
      ('${USER_ID}', 'user@example.com', 'User', 'hash', unixepoch(), unixepoch()),
      ('${OTHER_USER_ID}', 'other@example.com', 'Other', 'hash', unixepoch(), unixepoch());
  `)

  return { db, sqlite }
}

function createOwnedConversationService(db: ReturnType<typeof createTestDb>["db"]): OwnedConversationsService {
  const raw = createConversationsService(db)
  return {
    create: (data) => raw.create({ userId: USER_ID, ...data }),
    delete: (id: string) => raw.delete(id, USER_ID),
  }
}

describe("Memory Service", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let sqlite: Database.Database
  let service: OwnedMemoryService
  let rawService: ReturnType<typeof createMemoryService>

  beforeEach(() => {
    const result = createTestDb()
    db = result.db
    sqlite = result.sqlite
    rawService = createMemoryService(db)
    service = {
      create: (data) => rawService.create({ userId: USER_ID, ...data }),
      list: () => rawService.list(USER_ID),
      get: (id: string) => rawService.get(id, USER_ID),
      update: (id: string, data) => rawService.update(id, USER_ID, data),
      delete: (id: string) => rawService.delete(id, USER_ID),
      existsByContent: (content: string) => rawService.existsByContent(content, USER_ID),
      getFormattedForInjection: (maxChars?: number) => rawService.getFormattedForInjection(USER_ID, maxChars),
    }
  })

  afterEach(() => {
    sqlite.close()
  })

  describe("create", () => {
    it("creates a memory with type and content", () => {
      const memory = service.create({ type: "fact", content: "User's name is Jetze" })
      expect(memory.id).toBeTruthy()
      expect(memory.type).toBe("fact")
      expect(memory.content).toBe("User's name is Jetze")
      expect(memory.createdAt).toBeInstanceOf(Date)
    })

    it("creates a memory with sourceConversationId", () => {
      const convService = createOwnedConversationService(db)
      const conv = convService.create({ model: "gpt-4o", provider: "openai" })
      const memory = service.create({
        type: "preference",
        content: "User prefers TypeScript",
        sourceConversationId: conv.id,
      })
      expect(memory.sourceConversationId).toBe(conv.id)
    })

    it("defaults sourceConversationId to null", () => {
      const memory = service.create({ type: "fact", content: "test" })
      expect(memory.sourceConversationId).toBeNull()
    })
  })

  describe("list", () => {
    it("returns memories ordered by createdAt desc", () => {
      service.create({ type: "fact", content: "first" })
      service.create({ type: "fact", content: "second" })
      const memories = service.list()
      expect(memories).toHaveLength(2)
      expect(memories[0].content).toBe("second")
      expect(memories[1].content).toBe("first")
    })

    it("returns empty array when no memories", () => {
      expect(service.list()).toEqual([])
    })

    it("does not return memories owned by another user", () => {
      service.create({ type: "fact", content: "Mine" })
      rawService.create({ userId: OTHER_USER_ID, type: "fact", content: "Other" })

      const memories = service.list()
      expect(memories).toHaveLength(1)
      expect(memories[0].content).toBe("Mine")
    })
  })

  describe("get", () => {
    it("returns a memory by id", () => {
      const created = service.create({ type: "fact", content: "test" })
      const found = service.get(created.id)
      expect(found?.content).toBe("test")
    })

    it("returns undefined for missing id", () => {
      expect(service.get("nonexistent")).toBeUndefined()
    })

    it("returns undefined for another user's memory", () => {
      const other = rawService.create({ userId: OTHER_USER_ID, type: "fact", content: "Other" })
      expect(service.get(other.id)).toBeUndefined()
    })
  })

  describe("update", () => {
    it("updates content", () => {
      const memory = service.create({ type: "fact", content: "old" })
      service.update(memory.id, { content: "new" })
      expect(service.get(memory.id)?.content).toBe("new")
    })

    it("updates type", () => {
      const memory = service.create({ type: "fact", content: "test" })
      service.update(memory.id, { type: "preference" })
      expect(service.get(memory.id)?.type).toBe("preference")
    })
  })

  describe("delete", () => {
    it("removes a memory", () => {
      const memory = service.create({ type: "fact", content: "test" })
      service.delete(memory.id)
      expect(service.get(memory.id)).toBeUndefined()
    })

    it("memory persists when source conversation is deleted (FK set null)", () => {
      const convService = createOwnedConversationService(db)
      const conv = convService.create({ model: "gpt-4o", provider: "openai" })
      const memory = service.create({
        type: "fact",
        content: "persists",
        sourceConversationId: conv.id,
      })
      convService.delete(conv.id)
      const found = service.get(memory.id)
      expect(found).toBeDefined()
      expect(found?.sourceConversationId).toBeNull()
    })
  })

  describe("existsByContent", () => {
    it("returns true for existing content", () => {
      service.create({ type: "fact", content: "User likes coffee" })
      expect(service.existsByContent("User likes coffee")).toBe(true)
    })

    it("returns false for non-existing content", () => {
      expect(service.existsByContent("nonexistent")).toBe(false)
    })
  })

  describe("getFormattedForInjection", () => {
    it("returns empty string when no memories", () => {
      expect(service.getFormattedForInjection()).toBe("")
    })

    it("formats memories as bullet list", () => {
      service.create({ type: "fact", content: "User's name is Jetze" })
      service.create({ type: "preference", content: "User prefers TypeScript" })
      const formatted = service.getFormattedForInjection()
      expect(formatted).toContain("Here is what you know about the user")
      expect(formatted).toContain("- [fact] User's name is Jetze")
      expect(formatted).toContain("- [preference] User prefers TypeScript")
    })

    it("respects maxChars limit", () => {
      for (let i = 0; i < 50; i++) {
        service.create({ type: "fact", content: `Memory number ${i} with some padding text here` })
      }
      const formatted = service.getFormattedForInjection(200)
      expect(formatted.length).toBeLessThanOrEqual(200)
    })
  })
})
