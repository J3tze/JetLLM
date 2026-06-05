import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { and, desc, eq, isNull } from "drizzle-orm"
import { ulid } from "ulid"
import * as schema from "@/lib/db/schema"
import { getDb } from "@/lib/db"

export type Project = typeof schema.projects.$inferSelect

const DEFAULT_PROJECT_ICON = "\uD83D\uDCC1"

export function createProjectsService(db: BetterSQLite3Database<typeof schema>) {
  return {
    create(data: { userId: string; name?: string; icon?: string }): Project {
      const id = ulid()
      const now = new Date()
      db.insert(schema.projects)
        .values({
          id,
          userId: data.userId,
          name: data.name || "New Project",
          icon: data.icon || DEFAULT_PROJECT_ICON,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()!
    },

    list(userId: string): Project[] {
      return db.select()
        .from(schema.projects)
        .where(eq(schema.projects.userId, userId))
        .orderBy(desc(schema.projects.isPinned), desc(schema.projects.updatedAt))
        .all()
    },

    get(id: string, userId: string): Project | undefined {
      return db.select()
        .from(schema.projects)
        .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
        .get()
    },

    update(id: string, userId: string, data: Partial<{ name: string; icon: string; systemPrompt: string | null; isPinned: boolean }>): void {
      db.update(schema.projects)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
        .run()
    },

    delete(id: string, userId: string): void {
      db.delete(schema.projects)
        .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
        .run()
    },

    getConversations(projectId: string, userId: string) {
      return db.select().from(schema.conversations)
        .where(and(
          eq(schema.conversations.projectId, projectId),
          eq(schema.conversations.userId, userId)
        ))
        .orderBy(desc(schema.conversations.isPinned), desc(schema.conversations.updatedAt))
        .all()
    },

    getStandaloneConversations(userId: string) {
      return db.select().from(schema.conversations)
        .where(and(
          eq(schema.conversations.userId, userId),
          isNull(schema.conversations.projectId)
        ))
        .orderBy(desc(schema.conversations.isPinned), desc(schema.conversations.updatedAt))
        .all()
    },
  }
}

// Convenience functions using default db singleton
export function createProject(data: Parameters<ReturnType<typeof createProjectsService>["create"]>[0]) {
  return createProjectsService(getDb()).create(data)
}

export function listProjects(userId: string) {
  return createProjectsService(getDb()).list(userId)
}

export function getProject(id: string, userId: string) {
  return createProjectsService(getDb()).get(id, userId)
}

export function updateProject(id: string, userId: string, data: Parameters<ReturnType<typeof createProjectsService>["update"]>[2]) {
  return createProjectsService(getDb()).update(id, userId, data)
}

export function deleteProject(id: string, userId: string) {
  return createProjectsService(getDb()).delete(id, userId)
}

export function getProjectConversations(projectId: string, userId: string) {
  return createProjectsService(getDb()).getConversations(projectId, userId)
}

export function getStandaloneConversations(userId: string) {
  return createProjectsService(getDb()).getStandaloneConversations(userId)
}
