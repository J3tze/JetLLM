import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq, desc, and } from "drizzle-orm"
import { ulid } from "ulid"
import * as schema from "@/lib/db/schema"
import { getDb } from "@/lib/db"

export type Conversation = typeof schema.conversations.$inferSelect
export type Message = typeof schema.messages.$inferSelect

function getOwnedConversation(
  db: BetterSQLite3Database<typeof schema>,
  id: string,
  userId: string
): Conversation | undefined {
  return db.select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
    .get()
}

export function createConversationsService(db: BetterSQLite3Database<typeof schema>) {
  return {
    create(data: {
      userId: string
      model: string
      provider: string
      title?: string
      systemPrompt?: string
      projectId?: string
    }): Conversation {
      if (data.projectId) {
        const project = db.select()
          .from(schema.projects)
          .where(and(eq(schema.projects.id, data.projectId), eq(schema.projects.userId, data.userId)))
          .get()
        if (!project) {
          throw new Error("Project not found")
        }
      }

      const id = ulid()
      const now = new Date()
      db.insert(schema.conversations)
        .values({
          id,
          userId: data.userId,
          title: data.title || "New Chat",
          model: data.model,
          provider: data.provider,
          systemPrompt: data.systemPrompt || null,
          projectId: data.projectId || null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      return db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).get()!
    },

    list(userId: string): Conversation[] {
      return db.select()
        .from(schema.conversations)
        .where(eq(schema.conversations.userId, userId))
        .orderBy(desc(schema.conversations.isPinned), desc(schema.conversations.updatedAt))
        .all()
    },

    get(id: string, userId: string): Conversation | undefined {
      return getOwnedConversation(db, id, userId)
    },

    update(id: string, userId: string, data: Partial<{ title: string; model: string; provider: string; systemPrompt: string | null; isPinned: boolean }>): void {
      db.update(schema.conversations)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
        .run()
    },

    delete(id: string, userId: string): void {
      db.delete(schema.conversations)
        .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
        .run()
    },

    getMessages(conversationId: string, userId: string): Message[] {
      if (!getOwnedConversation(db, conversationId, userId)) {
        return []
      }

      return db.select().from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(schema.messages.createdAt)
        .all()
    },

    addMessage(data: {
      userId: string
      conversationId: string
      role: "user" | "assistant" | "system" | "tool"
      content: string
      toolCalls?: string
      metadata?: string
    }): Message {
      if (!getOwnedConversation(db, data.conversationId, data.userId)) {
        throw new Error("Conversation not found")
      }

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
        .where(and(eq(schema.conversations.id, data.conversationId), eq(schema.conversations.userId, data.userId)))
        .run()
      return db.select().from(schema.messages).where(eq(schema.messages.id, id)).get()!
    },

    deleteLatestAssistantMessage(conversationId: string, userId: string): void {
      if (!getOwnedConversation(db, conversationId, userId)) {
        return
      }

      const latestAssistant = db.select().from(schema.messages)
        .where(and(
          eq(schema.messages.conversationId, conversationId),
          eq(schema.messages.role, "assistant")
        ))
        .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
        .get()

      if (!latestAssistant) return

      db.delete(schema.messages)
        .where(eq(schema.messages.id, latestAssistant.id))
        .run()

      db.update(schema.conversations)
        .set({ updatedAt: new Date() })
        .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
        .run()
    },
  }
}

// Convenience functions using default db singleton
export function createConversation(data: Parameters<ReturnType<typeof createConversationsService>["create"]>[0]) {
  return createConversationsService(getDb()).create(data)
}

export function listConversations(userId: string) {
  return createConversationsService(getDb()).list(userId)
}

export function getConversation(id: string, userId: string) {
  return createConversationsService(getDb()).get(id, userId)
}

export function updateConversation(id: string, userId: string, data: Parameters<ReturnType<typeof createConversationsService>["update"]>[2]) {
  return createConversationsService(getDb()).update(id, userId, data)
}

export function deleteConversation(id: string, userId: string) {
  return createConversationsService(getDb()).delete(id, userId)
}

export function getMessages(conversationId: string, userId: string) {
  return createConversationsService(getDb()).getMessages(conversationId, userId)
}

export function addMessage(data: Parameters<ReturnType<typeof createConversationsService>["addMessage"]>[0]) {
  return createConversationsService(getDb()).addMessage(data)
}

export function deleteLatestAssistantMessage(conversationId: string, userId: string) {
  return createConversationsService(getDb()).deleteLatestAssistantMessage(conversationId, userId)
}
