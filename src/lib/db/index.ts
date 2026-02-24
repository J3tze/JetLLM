import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"
import * as schema from "./schema"
import path from "path"
import fs from "fs"

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "jetllm.db")

let db: BetterSQLite3Database<typeof schema>

export function getDb() {
  if (!db) {
    // Ensure data directory exists
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const sqlite = new Database(DB_PATH)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    db = drizzle({ client: sqlite, schema })
  }
  return db
}

export { schema }
