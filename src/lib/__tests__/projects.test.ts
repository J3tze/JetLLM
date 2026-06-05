import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../db/schema"
import { createProjectsService } from "../projects"
import { createConversationsService } from "../conversations"

const USER_ID = "user-1"
const OTHER_USER_ID = "user-2"

type RawProjectsService = ReturnType<typeof createProjectsService>
type RawConversationsService = ReturnType<typeof createConversationsService>
type OwnedProjectsService = {
  create(data: Omit<Parameters<RawProjectsService["create"]>[0], "userId">): ReturnType<RawProjectsService["create"]>
  list(): ReturnType<RawProjectsService["list"]>
  get(id: string): ReturnType<RawProjectsService["get"]>
  update(id: string, data: Parameters<RawProjectsService["update"]>[2]): ReturnType<RawProjectsService["update"]>
  delete(id: string): ReturnType<RawProjectsService["delete"]>
  getConversations(projectId: string): ReturnType<RawProjectsService["getConversations"]>
  getStandaloneConversations(): ReturnType<RawProjectsService["getStandaloneConversations"]>
}
type OwnedConversationsService = {
  create(data: Omit<Parameters<RawConversationsService["create"]>[0], "userId">): ReturnType<RawConversationsService["create"]>
  get(id: string): ReturnType<RawConversationsService["get"]>
  update(id: string, data: Parameters<RawConversationsService["update"]>[2]): ReturnType<RawConversationsService["update"]>
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

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon TEXT,
      system_prompt TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
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
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
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

    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
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
    get: (id: string) => raw.get(id, USER_ID),
    update: (id: string, data) => raw.update(id, USER_ID, data),
  }
}

describe("Projects Service", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let sqlite: Database.Database
  let service: OwnedProjectsService
  let rawService: ReturnType<typeof createProjectsService>

  beforeEach(() => {
    const result = createTestDb()
    db = result.db
    sqlite = result.sqlite
    rawService = createProjectsService(db)
    service = {
      create: (data) => rawService.create({ userId: USER_ID, ...data }),
      list: () => rawService.list(USER_ID),
      get: (id: string) => rawService.get(id, USER_ID),
      update: (id: string, data) => rawService.update(id, USER_ID, data),
      delete: (id: string) => rawService.delete(id, USER_ID),
      getConversations: (projectId: string) => rawService.getConversations(projectId, USER_ID),
      getStandaloneConversations: () => rawService.getStandaloneConversations(USER_ID),
    }
  })

  afterEach(() => {
    sqlite.close()
  })

  describe("create", () => {
    it("creates a project with default name and icon", () => {
      const project = service.create({})

      expect(project).toBeDefined()
      expect(project.id).toBeTruthy()
      expect(project.name).toBe("New Project")
      expect(project.icon).toBe("📁")
      expect(project.systemPrompt).toBeNull()
      expect(project.createdAt).toBeInstanceOf(Date)
      expect(project.updatedAt).toBeInstanceOf(Date)
    })

    it("accepts custom name and icon", () => {
      const project = service.create({ name: "My Research", icon: "🔬" })

      expect(project.name).toBe("My Research")
      expect(project.icon).toBe("🔬")
    })
  })

  describe("list", () => {
    it("returns projects ordered by updatedAt desc", () => {
      const p1 = service.create({ name: "First" })
      service.create({ name: "Second" })
      service.create({ name: "Third" })

      // Update p1 to make it most recent
      service.update(p1.id, { name: "First (updated)" })

      const list = service.list()
      expect(list).toHaveLength(3)
      expect(list[0].name).toBe("First (updated)")
    })

    it("returns empty array when no projects exist", () => {
      const list = service.list()
      expect(list).toEqual([])
    })

    it("does not return projects owned by another user", () => {
      service.create({ name: "Mine" })
      rawService.create({ userId: OTHER_USER_ID, name: "Other" })

      const list = service.list()
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe("Mine")
    })
  })

  describe("get", () => {
    it("returns a project by id", () => {
      const created = service.create({ name: "Test Project" })
      const found = service.get(created.id)

      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
      expect(found!.name).toBe("Test Project")
    })

    it("returns undefined for a missing id", () => {
      const found = service.get("nonexistent-id")
      expect(found).toBeUndefined()
    })

    it("returns undefined for another user's project", () => {
      const other = rawService.create({ userId: OTHER_USER_ID, name: "Other" })
      expect(service.get(other.id)).toBeUndefined()
    })
  })

  describe("update", () => {
    it("updates name", () => {
      const project = service.create({ name: "Original" })
      service.update(project.id, { name: "Updated Name" })

      const updated = service.get(project.id)
      expect(updated!.name).toBe("Updated Name")
    })

    it("updates icon", () => {
      const project = service.create({ name: "Test" })
      service.update(project.id, { icon: "🚀" })

      const updated = service.get(project.id)
      expect(updated!.icon).toBe("🚀")
    })

    it("updates systemPrompt", () => {
      const project = service.create({ name: "Test" })
      service.update(project.id, { systemPrompt: "You are a coding assistant." })

      const updated = service.get(project.id)
      expect(updated!.systemPrompt).toBe("You are a coding assistant.")
    })

    it("can clear systemPrompt with null", () => {
      const project = service.create({ name: "Test" })
      service.update(project.id, { systemPrompt: "Something" })
      service.update(project.id, { systemPrompt: null })

      const updated = service.get(project.id)
      expect(updated!.systemPrompt).toBeNull()
    })

    it("updates updatedAt timestamp", () => {
      const project = service.create({ name: "Test" })
      const originalUpdatedAt = project.updatedAt

      service.update(project.id, { name: "Changed" })
      const updated = service.get(project.id)

      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime())
    })
  })

  describe("delete", () => {
    it("removes the project", () => {
      const project = service.create({ name: "To Delete" })
      service.delete(project.id)

      const found = service.get(project.id)
      expect(found).toBeUndefined()
    })

    it("cascades delete to documents", () => {
      const project = service.create({ name: "With Docs" })

      // Insert a document directly via raw SQL since we don't have a documents service yet
      sqlite.exec(`
        INSERT INTO documents (id, project_id, name, content, chunk_count, status, created_at)
        VALUES ('doc1', '${project.id}', 'test.txt', 'hello world', 0, 'pending', unixepoch())
      `)

      // Verify document exists
      const docBefore = sqlite.prepare("SELECT * FROM documents WHERE project_id = ?").get(project.id)
      expect(docBefore).toBeDefined()

      // Delete project
      service.delete(project.id)

      // Document should be gone too (cascade delete)
      const docAfter = sqlite.prepare("SELECT * FROM documents WHERE project_id = ?").get(project.id)
      expect(docAfter).toBeUndefined()
    })

    it("sets projectId to null on associated conversations", () => {
      const project = service.create({ name: "With Convos" })

      // Create a conversation linked to this project
      const convService = createOwnedConversationService(db)
      const conv = convService.create({
        model: "gpt-4o",
        provider: "openai",
        projectId: project.id,
      })

      expect(conv.projectId).toBe(project.id)

      // Delete project
      service.delete(project.id)

      // Conversation should still exist but projectId should be null
      const updatedConv = convService.get(conv.id)
      expect(updatedConv).toBeDefined()
      expect(updatedConv!.projectId).toBeNull()
    })
  })

  describe("getConversations", () => {
    it("returns conversations for a specific project", () => {
      const project = service.create({ name: "My Project" })
      const convService = createOwnedConversationService(db)

      convService.create({ model: "gpt-4o", provider: "openai", title: "Project Chat", projectId: project.id })
      convService.create({ model: "gpt-4o", provider: "openai", title: "Standalone Chat" })

      const projectConvs = service.getConversations(project.id)
      expect(projectConvs).toHaveLength(1)
      expect(projectConvs[0].title).toBe("Project Chat")
    })

    it("returns empty array when project has no conversations", () => {
      const project = service.create({ name: "Empty Project" })
      const convs = service.getConversations(project.id)
      expect(convs).toEqual([])
    })

    it("returns conversations ordered by updatedAt desc", () => {
      const project = service.create({ name: "My Project" })
      const convService = createOwnedConversationService(db)

      const conv1 = convService.create({ model: "gpt-4o", provider: "openai", title: "First", projectId: project.id })
      convService.create({ model: "gpt-4o", provider: "openai", title: "Second", projectId: project.id })

      // Update conv1 to make it most recent
      convService.update(conv1.id, { title: "First (updated)" })

      const convs = service.getConversations(project.id)
      expect(convs).toHaveLength(2)
      expect(convs[0].title).toBe("First (updated)")
    })
  })

  describe("getStandaloneConversations", () => {
    it("returns only conversations without a projectId", () => {
      const project = service.create({ name: "My Project" })
      const convService = createOwnedConversationService(db)

      convService.create({ model: "gpt-4o", provider: "openai", title: "Project Chat", projectId: project.id })
      convService.create({ model: "gpt-4o", provider: "openai", title: "Standalone Chat" })

      const standalone = service.getStandaloneConversations()
      expect(standalone).toHaveLength(1)
      expect(standalone[0].title).toBe("Standalone Chat")
    })

    it("returns empty array when all conversations have projects", () => {
      const project = service.create({ name: "My Project" })
      const convService = createOwnedConversationService(db)

      convService.create({ model: "gpt-4o", provider: "openai", projectId: project.id })

      const standalone = service.getStandaloneConversations()
      expect(standalone).toEqual([])
    })
  })
})
