import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../db/schema"
import { createSettingsService } from "../settings"

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle({ client: sqlite, schema })

  sqlite.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return { db, sqlite }
}

describe("Settings Service", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let sqlite: Database.Database
  let settings: ReturnType<typeof createSettingsService>

  beforeEach(() => {
    const result = createTestDb()
    db = result.db
    sqlite = result.sqlite
    settings = createSettingsService(db)
  })

  afterEach(() => {
    sqlite.close()
  })

  describe("setSetting / getSetting", () => {
    it("stores and retrieves a string value", () => {
      settings.set("name", "Jetze")
      expect(settings.get<string>("name")).toBe("Jetze")
    })

    it("stores and retrieves a JSON object", () => {
      const config = { apiKey: "sk-123", baseUrl: "https://api.openai.com" }
      settings.set("provider:openai", config)
      expect(settings.get("provider:openai")).toEqual(config)
    })

    it("returns null for missing key", () => {
      expect(settings.get("nonexistent")).toBeNull()
    })

    it("overwrites existing key", () => {
      settings.set("key", "first")
      settings.set("key", "second")
      expect(settings.get<string>("key")).toBe("second")
    })
  })

  describe("deleteSetting", () => {
    it("removes a setting", () => {
      settings.set("temp", "value")
      settings.delete("temp")
      expect(settings.get("temp")).toBeNull()
    })

    it("does not error when deleting nonexistent key", () => {
      expect(() => settings.delete("ghost")).not.toThrow()
    })
  })

  describe("getAllSettings", () => {
    it("returns all settings as a record", () => {
      settings.set("a", "hello")
      settings.set("b", { nested: true })
      const all = settings.getAll()
      expect(all).toEqual({ a: "hello", b: { nested: true } })
    })

    it("returns empty object when no settings", () => {
      expect(settings.getAll()).toEqual({})
    })
  })
})
