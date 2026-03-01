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
      return db.select().from(schema.projects).orderBy(desc(schema.projects.isPinned), desc(schema.projects.updatedAt)).all()
    },

    get(id: string): Project | undefined {
      return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()
    },

    update(id: string, data: Partial<{ name: string; icon: string; systemPrompt: string | null; isPinned: boolean }>): void {
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
        .orderBy(desc(schema.conversations.isPinned), desc(schema.conversations.updatedAt))
        .all()
    },

    getStandaloneConversations() {
      return db.select().from(schema.conversations)
        .where(isNull(schema.conversations.projectId))
        .orderBy(desc(schema.conversations.isPinned), desc(schema.conversations.updatedAt))
        .all()
    },
  }
}

// Convenience functions using default db singleton
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
