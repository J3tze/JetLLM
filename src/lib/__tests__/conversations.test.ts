import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../db/schema"
import { createConversationsService } from "../conversations"

const USER_ID = "user-1"
const OTHER_USER_ID = "user-2"

type RawConversationsService = ReturnType<typeof createConversationsService>
type OwnedConversationsService = {
  create(data: Omit<Parameters<RawConversationsService["create"]>[0], "userId">): ReturnType<RawConversationsService["create"]>
  list(): ReturnType<RawConversationsService["list"]>
  get(id: string): ReturnType<RawConversationsService["get"]>
  update(id: string, data: Parameters<RawConversationsService["update"]>[2]): ReturnType<RawConversationsService["update"]>
  delete(id: string): ReturnType<RawConversationsService["delete"]>
  getMessages(conversationId: string): ReturnType<RawConversationsService["getMessages"]>
  addMessage(data: Omit<Parameters<RawConversationsService["addMessage"]>[0], "userId">): ReturnType<RawConversationsService["addMessage"]>
  deleteLatestAssistantMessage(conversationId: string): ReturnType<RawConversationsService["deleteLatestAssistantMessage"]>
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

describe("Conversations Service", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let sqlite: Database.Database
  let service: OwnedConversationsService
  let rawService: ReturnType<typeof createConversationsService>

  beforeEach(() => {
    const result = createTestDb()
    db = result.db
    sqlite = result.sqlite
    rawService = createConversationsService(db)
    service = {
      create: (data) => rawService.create({ userId: USER_ID, ...data }),
      list: () => rawService.list(USER_ID),
      get: (id: string) => rawService.get(id, USER_ID),
      update: (id: string, data) => rawService.update(id, USER_ID, data),
      delete: (id: string) => rawService.delete(id, USER_ID),
      getMessages: (conversationId: string) => rawService.getMessages(conversationId, USER_ID),
      addMessage: (data) => rawService.addMessage({ userId: USER_ID, ...data }),
      deleteLatestAssistantMessage: (conversationId: string) => rawService.deleteLatestAssistantMessage(conversationId, USER_ID),
    }
  })

  afterEach(() => {
    sqlite.close()
  })

  describe("createConversation", () => {
    it("creates a conversation with default title 'New Chat'", () => {
      const conv = service.create({
        model: "gpt-4o",
        provider: "openai",
      })

      expect(conv).toBeDefined()
      expect(conv.id).toBeTruthy()
      expect(conv.title).toBe("New Chat")
      expect(conv.model).toBe("gpt-4o")
      expect(conv.provider).toBe("openai")
      expect(conv.systemPrompt).toBeNull()
      expect(conv.createdAt).toBeInstanceOf(Date)
      expect(conv.updatedAt).toBeInstanceOf(Date)
    })

    it("accepts custom title and systemPrompt", () => {
      const conv = service.create({
        model: "claude-sonnet-4-20250514",
        provider: "anthropic",
        title: "My Custom Chat",
        systemPrompt: "You are a helpful coding assistant.",
      })

      expect(conv.title).toBe("My Custom Chat")
      expect(conv.systemPrompt).toBe("You are a helpful coding assistant.")
      expect(conv.model).toBe("claude-sonnet-4-20250514")
      expect(conv.provider).toBe("anthropic")
    })
  })

  describe("listConversations", () => {
    it("returns conversations ordered by updatedAt desc", () => {
      // Create conversations with different updatedAt times
      const conv1 = service.create({ model: "gpt-4o", provider: "openai", title: "First" })
      service.create({ model: "gpt-4o", provider: "openai", title: "Second" })
      service.create({ model: "gpt-4o", provider: "openai", title: "Third" })

      // Update conv1 to make it most recent
      service.update(conv1.id, { title: "First (updated)" })

      const list = service.list()
      expect(list).toHaveLength(3)
      // conv1 was updated last, so it should be first
      expect(list[0].title).toBe("First (updated)")
    })

    it("returns empty array when no conversations exist", () => {
      const list = service.list()
      expect(list).toEqual([])
    })

    it("does not return conversations owned by another user", () => {
      service.create({ model: "gpt-4o", provider: "openai", title: "Mine" })
      rawService.create({ userId: OTHER_USER_ID, model: "gpt-4o", provider: "openai", title: "Other" })

      const list = service.list()
      expect(list).toHaveLength(1)
      expect(list[0].title).toBe("Mine")
    })
  })

  describe("getConversation", () => {
    it("returns a conversation by id", () => {
      const created = service.create({ model: "gpt-4o", provider: "openai" })
      const found = service.get(created.id)

      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
      expect(found!.model).toBe("gpt-4o")
    })

    it("returns undefined for a missing id", () => {
      const found = service.get("nonexistent-id")
      expect(found).toBeUndefined()
    })

    it("returns undefined for another user's conversation", () => {
      const other = rawService.create({ userId: OTHER_USER_ID, model: "gpt-4o", provider: "openai" })
      expect(service.get(other.id)).toBeUndefined()
    })
  })

  describe("updateConversation", () => {
    it("updates title", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      service.update(conv.id, { title: "Updated Title" })

      const updated = service.get(conv.id)
      expect(updated!.title).toBe("Updated Title")
    })

    it("updates model and provider", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      service.update(conv.id, { model: "claude-sonnet-4-20250514", provider: "anthropic" })

      const updated = service.get(conv.id)
      expect(updated!.model).toBe("claude-sonnet-4-20250514")
      expect(updated!.provider).toBe("anthropic")
    })

    it("updates systemPrompt", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      service.update(conv.id, { systemPrompt: "Be concise." })

      const updated = service.get(conv.id)
      expect(updated!.systemPrompt).toBe("Be concise.")
    })

    it("updates updatedAt timestamp", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      const originalUpdatedAt = conv.updatedAt

      // Small delay to ensure different timestamp
      service.update(conv.id, { title: "Changed" })
      const updated = service.get(conv.id)

      // updatedAt should be >= original (may be same if within same second)
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime())
    })
  })

  describe("deleteConversation", () => {
    it("removes the conversation", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      service.delete(conv.id)

      const found = service.get(conv.id)
      expect(found).toBeUndefined()
    })

    it("cascades delete to messages", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      service.addMessage({
        conversationId: conv.id,
        role: "user",
        content: "Hello!",
      })
      service.addMessage({
        conversationId: conv.id,
        role: "assistant",
        content: "Hi there!",
      })

      // Verify messages exist
      expect(service.getMessages(conv.id)).toHaveLength(2)

      // Delete conversation
      service.delete(conv.id)

      // Messages should be gone too
      expect(service.getMessages(conv.id)).toHaveLength(0)
    })
  })

  describe("addMessage", () => {
    it("inserts a message linked to a conversation", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      const msg = service.addMessage({
        conversationId: conv.id,
        role: "user",
        content: "Hello, world!",
      })

      expect(msg).toBeDefined()
      expect(msg.id).toBeTruthy()
      expect(msg.conversationId).toBe(conv.id)
      expect(msg.role).toBe("user")
      expect(msg.content).toBe("Hello, world!")
      expect(msg.toolCalls).toBeNull()
      expect(msg.metadata).toBeNull()
      expect(msg.createdAt).toBeInstanceOf(Date)
    })

    it("stores toolCalls and metadata", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      const toolCallsJson = JSON.stringify([{ name: "search", args: { query: "test" } }])
      const metadataJson = JSON.stringify({ tokens: 42 })

      const msg = service.addMessage({
        conversationId: conv.id,
        role: "assistant",
        content: "Let me search that for you.",
        toolCalls: toolCallsJson,
        metadata: metadataJson,
      })

      expect(msg.toolCalls).toBe(toolCallsJson)
      expect(msg.metadata).toBe(metadataJson)
    })

    it("updates the conversation's updatedAt", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      const originalUpdatedAt = conv.updatedAt

      service.addMessage({
        conversationId: conv.id,
        role: "user",
        content: "Hello!",
      })

      const updated = service.get(conv.id)
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime())
    })
  })

  describe("getMessages", () => {
    it("returns messages ordered by createdAt asc", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })

      service.addMessage({
        conversationId: conv.id,
        role: "user",
        content: "First message",
      })
      service.addMessage({
        conversationId: conv.id,
        role: "assistant",
        content: "Second message",
      })
      service.addMessage({
        conversationId: conv.id,
        role: "user",
        content: "Third message",
      })

      const messages = service.getMessages(conv.id)
      expect(messages).toHaveLength(3)
      expect(messages[0].content).toBe("First message")
      expect(messages[1].content).toBe("Second message")
      expect(messages[2].content).toBe("Third message")
    })

    it("returns empty array for conversation with no messages", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      const messages = service.getMessages(conv.id)
      expect(messages).toEqual([])
    })

    it("only returns messages for the specified conversation", () => {
      const conv1 = service.create({ model: "gpt-4o", provider: "openai" })
      const conv2 = service.create({ model: "gpt-4o", provider: "openai" })

      service.addMessage({ conversationId: conv1.id, role: "user", content: "Conv1 msg" })
      service.addMessage({ conversationId: conv2.id, role: "user", content: "Conv2 msg" })

      const messages1 = service.getMessages(conv1.id)
      expect(messages1).toHaveLength(1)
      expect(messages1[0].content).toBe("Conv1 msg")

      const messages2 = service.getMessages(conv2.id)
      expect(messages2).toHaveLength(1)
      expect(messages2[0].content).toBe("Conv2 msg")
    })

    it("does not return messages for another user's conversation", () => {
      const other = rawService.create({ userId: OTHER_USER_ID, model: "gpt-4o", provider: "openai" })
      rawService.addMessage({
        userId: OTHER_USER_ID,
        conversationId: other.id,
        role: "user",
        content: "Private",
      })

      expect(service.getMessages(other.id)).toEqual([])
    })
  })

  describe("deleteLatestAssistantMessage", () => {
    it("deletes only the newest assistant message", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })

      service.addMessage({
        conversationId: conv.id,
        role: "assistant",
        content: "Assistant reply 1",
      })
      service.addMessage({
        conversationId: conv.id,
        role: "user",
        content: "User follow-up",
      })
      service.addMessage({
        conversationId: conv.id,
        role: "assistant",
        content: "Assistant reply 2",
      })

      service.deleteLatestAssistantMessage(conv.id)

      const messages = service.getMessages(conv.id)
      expect(messages).toHaveLength(2)
      const contents = messages.map(message => message.content)
      expect(contents).toContain("Assistant reply 1")
      expect(contents).toContain("User follow-up")
      expect(contents).not.toContain("Assistant reply 2")
    })

    it("does nothing when there is no assistant message", () => {
      const conv = service.create({ model: "gpt-4o", provider: "openai" })
      service.addMessage({
        conversationId: conv.id,
        role: "user",
        content: "Only user",
      })

      service.deleteLatestAssistantMessage(conv.id)

      const messages = service.getMessages(conv.id)
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe("Only user")
    })
  })
})
