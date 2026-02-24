import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq, desc } from "drizzle-orm"
import { ulid } from "ulid"
import * as schema from "@/lib/db/schema"
import { getDb } from "@/lib/db"

export type Conversation = typeof schema.conversations.$inferSelect
export type Message = typeof schema.messages.$inferSelect

export function createConversationsService(db: BetterSQLite3Database<typeof schema>) {
  return {
    create(data: {
      model: string
      provider: string
      title?: string
      systemPrompt?: string
    }): Conversation {
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
      return db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).get()!
    },

    list(): Conversation[] {
      return db.select().from(schema.conversations).orderBy(desc(schema.conversations.updatedAt)).all()
    },

    get(id: string): Conversation | undefined {
      return db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).get()
    },

    update(id: string, data: Partial<{ title: string; model: string; provider: string; systemPrompt: string | null }>): void {
      db.update(schema.conversations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.conversations.id, id))
        .run()
    },

    delete(id: string): void {
      db.delete(schema.conversations).where(eq(schema.conversations.id, id)).run()
    },

    getMessages(conversationId: string): Message[] {
      return db.select().from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(schema.messages.createdAt)
        .all()
    },

    addMessage(data: {
      conversationId: string
      role: "user" | "assistant" | "system" | "tool"
      content: string
      toolCalls?: string
      metadata?: string
    }): Message {
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
      db.update(schema.conversations)
        .set({ updatedAt: new Date() })
        .where(eq(schema.conversations.id, data.conversationId))
        .run()
      return db.select().from(schema.messages).where(eq(schema.messages.id, id)).get()!
    },
  }
}

// Convenience functions using default db singleton
export function createConversation(data: Parameters<ReturnType<typeof createConversationsService>["create"]>[0]) {
  return createConversationsService(getDb()).create(data)
}

export function listConversations() {
  return createConversationsService(getDb()).list()
}

export function getConversation(id: string) {
  return createConversationsService(getDb()).get(id)
}

export function updateConversation(id: string, data: Parameters<ReturnType<typeof createConversationsService>["update"]>[1]) {
  return createConversationsService(getDb()).update(id, data)
}

export function deleteConversation(id: string) {
  return createConversationsService(getDb()).delete(id)
}

export function getMessages(conversationId: string) {
  return createConversationsService(getDb()).getMessages(conversationId)
}

export function addMessage(data: Parameters<ReturnType<typeof createConversationsService>["addMessage"]>[0]) {
  return createConversationsService(getDb()).addMessage(data)
}
