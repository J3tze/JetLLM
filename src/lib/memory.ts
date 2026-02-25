import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq, desc } from "drizzle-orm"
import { ulid } from "ulid"
import * as schema from "@/lib/db/schema"
import { getDb } from "@/lib/db"

export type Memory = typeof schema.memories.$inferSelect
export type MemoryType = "fact" | "preference" | "summary"

export function createMemoryService(db: BetterSQLite3Database<typeof schema>) {
  return {
    create(data: {
      type: MemoryType
      content: string
      sourceConversationId?: string | null
    }): Memory {
      const id = ulid()
      db.insert(schema.memories)
        .values({
          id,
          type: data.type,
          content: data.content,
          sourceConversationId: data.sourceConversationId || null,
          createdAt: new Date(),
        })
        .run()
      return db.select().from(schema.memories).where(eq(schema.memories.id, id)).get()!
    },

    list(): Memory[] {
      return db.select().from(schema.memories)
        .orderBy(desc(schema.memories.id))
        .all()
    },

    get(id: string): Memory | undefined {
      return db.select().from(schema.memories)
        .where(eq(schema.memories.id, id))
        .get()
    },

    update(id: string, data: Partial<{ content: string; type: MemoryType }>): void {
      db.update(schema.memories)
        .set(data)
        .where(eq(schema.memories.id, id))
        .run()
    },

    delete(id: string): void {
      db.delete(schema.memories).where(eq(schema.memories.id, id)).run()
    },

    existsByContent(content: string): boolean {
      const row = db.select()
        .from(schema.memories)
        .where(eq(schema.memories.content, content))
        .get()
      return !!row
    },

    getFormattedForInjection(maxChars: number = 2000): string {
      const memories = db.select().from(schema.memories)
        .orderBy(desc(schema.memories.id))
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

export function listMemories() {
  return createMemoryService(getDb()).list()
}

export function getMemory(id: string) {
  return createMemoryService(getDb()).get(id)
}

export function updateMemory(id: string, data: Parameters<ReturnType<typeof createMemoryService>["update"]>[1]) {
  return createMemoryService(getDb()).update(id, data)
}

export function deleteMemory(id: string) {
  return createMemoryService(getDb()).delete(id)
}

export function memoryExistsByContent(content: string) {
  return createMemoryService(getDb()).existsByContent(content)
}

export function getFormattedMemories(maxChars?: number) {
  return createMemoryService(getDb()).getFormattedForInjection(maxChars)
}
