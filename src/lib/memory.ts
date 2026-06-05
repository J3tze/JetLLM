import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { and, eq, desc } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { ulid } from "ulid"
import * as schema from "@/lib/db/schema"
import { getDb } from "@/lib/db"

export type Memory = typeof schema.memories.$inferSelect
export type MemoryType = "fact" | "preference" | "summary"

export function createMemoryService(db: BetterSQLite3Database<typeof schema>) {
  return {
    create(data: {
      userId: string
      type: MemoryType
      content: string
      sourceConversationId?: string | null
    }): Memory {
      const id = ulid()
      db.insert(schema.memories)
        .values({
          id,
          userId: data.userId,
          type: data.type,
          content: data.content,
          sourceConversationId: data.sourceConversationId || null,
          createdAt: new Date(),
        })
        .run()
      return db.select().from(schema.memories).where(eq(schema.memories.id, id)).get()!
    },

    list(userId: string): Memory[] {
      return db.select().from(schema.memories)
        .where(eq(schema.memories.userId, userId))
        .orderBy(desc(schema.memories.createdAt), desc(schema.memories.id))
        .all()
    },

    get(id: string, userId: string): Memory | undefined {
      return db.select().from(schema.memories)
        .where(and(eq(schema.memories.id, id), eq(schema.memories.userId, userId)))
        .get()
    },

    update(id: string, userId: string, data: Partial<{ content: string; type: MemoryType }>): void {
      db.update(schema.memories)
        .set(data)
        .where(and(eq(schema.memories.id, id), eq(schema.memories.userId, userId)))
        .run()
    },

    delete(id: string, userId: string): void {
      db.delete(schema.memories)
        .where(and(eq(schema.memories.id, id), eq(schema.memories.userId, userId)))
        .run()
    },

    existsByContent(content: string, userId: string): boolean {
      const row = db.select()
        .from(schema.memories)
        .where(and(
          eq(schema.memories.userId, userId),
          sql`${schema.memories.content} = ${content} COLLATE NOCASE`
        ))
        .get()
      return !!row
    },

    getFormattedForInjection(userId: string, maxChars: number = 2000): string {
      const memories = db.select().from(schema.memories)
        .where(eq(schema.memories.userId, userId))
        .orderBy(desc(schema.memories.createdAt), desc(schema.memories.id))
        .limit(50)
        .all()

      if (memories.length === 0) return ""

      let result = "Here is what you know about the user from previous conversations:\n"
      for (const mem of memories) {
        const line = `- [${mem.type}] ${mem.content}\n`
        if (result.length + line.length > maxChars) break
        result += line
      }
      return result
    },
  }
}

// Convenience functions using default db singleton
export function createMemory(data: Parameters<ReturnType<typeof createMemoryService>["create"]>[0]) {
  return createMemoryService(getDb()).create(data)
}

export function listMemories(userId: string) {
  return createMemoryService(getDb()).list(userId)
}

export function getMemory(id: string, userId: string) {
  return createMemoryService(getDb()).get(id, userId)
}

export function updateMemory(id: string, userId: string, data: Parameters<ReturnType<typeof createMemoryService>["update"]>[2]) {
  return createMemoryService(getDb()).update(id, userId, data)
}

export function deleteMemory(id: string, userId: string) {
  return createMemoryService(getDb()).delete(id, userId)
}

export function memoryExistsByContent(content: string, userId: string) {
  return createMemoryService(getDb()).existsByContent(content, userId)
}

export function getFormattedMemories(userId: string, maxChars?: number) {
  return createMemoryService(getDb()).getFormattedForInjection(userId, maxChars)
}
