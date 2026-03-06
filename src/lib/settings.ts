import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq, inArray } from "drizzle-orm"
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

function parseSettingValue<T = unknown>(value: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return value as T
  }
}

function normalizeKeys(keys: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(keys)
        .map(key => key.trim())
        .filter(Boolean)
    )
  )
}

function rowsToRecord(rows: Array<{ key: string; value: string }>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    result[row.key] = parseSettingValue(row.value)
  }
  return result
}

export function createSettingsService(db: BetterSQLite3Database<typeof schema>) {
  return {
    get<T = string>(key: string): T | null {
      const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
      if (!row) return null
      return parseSettingValue<T>(row.value)
    },

    getMany(keys: Iterable<string>): Record<string, unknown> {
      const normalizedKeys = normalizeKeys(keys)
      if (normalizedKeys.length === 0) {
        return {}
      }

      const rows = db.select()
        .from(schema.settings)
        .where(inArray(schema.settings.key, normalizedKeys))
        .all()

      return rowsToRecord(rows)
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
      return rowsToRecord(rows)
    },
  }
}

// Convenience functions using the default db singleton
export function getSetting<T = string>(key: string): T | null {
  return createSettingsService(getDb()).get<T>(key)
}

export function getSettings(keys: Iterable<string>): Record<string, unknown> {
  return createSettingsService(getDb()).getMany(keys)
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

export function getProviderSettings(providerIds: Iterable<string>): ProviderSettings {
  const ids = normalizeKeys(providerIds)
  if (ids.length === 0) {
    return {}
  }

  const settings = createSettingsService(getDb()).getMany(
    ids.map(providerId => `provider:${providerId}`)
  )

  const result: ProviderSettings = {}
  for (const providerId of ids) {
    const config = settings[`provider:${providerId}`]
    if (config && typeof config === "object" && !Array.isArray(config)) {
      result[providerId] = config as ProviderConfig
    }
  }

  return result
}
