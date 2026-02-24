import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq } from "drizzle-orm"
import * as schema from "@/lib/db/schema"
import { getDb } from "@/lib/db"

export type ProviderConfig = {
  apiKey: string
  baseUrl?: string
  models?: string[]
}

export type ProviderSettings = {
  [provider: string]: ProviderConfig
}

export function createSettingsService(db: BetterSQLite3Database<typeof schema>) {
  return {
    get<T = string>(key: string): T | null {
      const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
      if (!row) return null
      try {
        return JSON.parse(row.value) as T
      } catch {
        return row.value as T
      }
    },

    set(key: string, value: unknown): void {
      const serialized = typeof value === "string" ? value : JSON.stringify(value)
      db.insert(schema.settings)
        .values({ key, value: serialized })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: serialized } })
        .run()
    },

    delete(key: string): void {
      db.delete(schema.settings).where(eq(schema.settings.key, key)).run()
    },

    getAll(): Record<string, unknown> {
      const rows = db.select().from(schema.settings).all()
      const result: Record<string, unknown> = {}
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value)
        } catch {
          result[row.key] = row.value
        }
      }
      return result
    },
  }
}

// Convenience functions using the default db singleton
export function getSetting<T = string>(key: string): T | null {
  return createSettingsService(getDb()).get<T>(key)
}

export function setSetting(key: string, value: unknown): void {
  createSettingsService(getDb()).set(key, value)
}

export function deleteSetting(key: string): void {
  createSettingsService(getDb()).delete(key)
}

export function getAllSettings(): Record<string, unknown> {
  return createSettingsService(getDb()).getAll()
}
