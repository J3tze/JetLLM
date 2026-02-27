import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"
import * as sqliteVec from "sqlite-vec"
import * as schema from "./schema"
import path from "path"
import fs from "fs"

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "jetllm.db")

let db: BetterSQLite3Database<typeof schema>
let rawSqlite: InstanceType<typeof Database>

function ensureTables(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      system_prompt TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      system_prompt TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('fact', 'preference', 'summary')),
      content TEXT NOT NULL,
      source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  // Create sqlite-vec virtual table for vector search
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      chunk_id TEXT PRIMARY KEY,
      embedding FLOAT[1536]
    );
  `)

  // Migration: add project_id column to conversations for existing databases
  try {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`)
  } catch {
    // Column already exists — ignore
  }
}

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
    sqlite.pragma("busy_timeout = 5000")

    sqliteVec.load(sqlite)
    ensureTables(sqlite)

    rawSqlite = sqlite
    db = drizzle({ client: sqlite, schema })
  }
  return db
}

/** Return the raw better-sqlite3 Database instance (for sqlite-vec virtual tables, etc.) */
export function getRawDb(): InstanceType<typeof Database> {
  // Ensure initialisation has happened
  getDb()
  return rawSqlite
}

export { schema }
