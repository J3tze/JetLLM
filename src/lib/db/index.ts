import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"
import * as schema from "./schema"
import path from "path"
import fs from "fs"
import { createRequire } from "module"

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "jetllm.db")
const nodeRequire = createRequire(process.cwd() + "/src/lib/db/index.ts")

let db: BetterSQLite3Database<typeof schema>
let rawSqlite: InstanceType<typeof Database>

function loadSqliteVecExtension(sqlite: InstanceType<typeof Database>) {
  // Optional runtime dependency: avoid static import so builds still pass when sqlite-vec is missing.
  try {
    const maybeModule = nodeRequire("sqlite-vec") as { load?: (db: InstanceType<typeof Database>) => void }
    if (typeof maybeModule.load === "function") {
      maybeModule.load(sqlite)
      return
    }
    console.warn("[db] sqlite-vec module found but has no load() export (RAG will be unavailable)")
  } catch (err) {
    console.warn("[db] sqlite-vec not installed/available (RAG will be unavailable):", err)
  }
}

function ensureTables(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      system_prompt TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      is_pinned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      system_prompt TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      is_pinned INTEGER NOT NULL DEFAULT 0
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

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  // Create sqlite-vec virtual table for vector search (only if extension loaded)
  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding FLOAT[1536]
      );
    `)
  } catch {
    // sqlite-vec not available — skip vector table creation
  }

  // Migration: add project_id column to conversations for existing databases
  try {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`)
  } catch {
    // Column already exists — ignore
  }

  // Migration: add is_pinned column
  try {
    sqlite.exec(`ALTER TABLE projects ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // Column already exists
  }

  // Query performance indexes for hot paths (lists, message history, pinning, memory lookup)
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_pinned_updated
    ON projects(is_pinned DESC, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_conversations_pinned_updated
    ON conversations(is_pinned DESC, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_conversations_project_pinned_updated
    ON conversations(project_id, is_pinned DESC, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_role_created
    ON messages(conversation_id, role, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memories_content_nocase
    ON memories(content COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_memories_created
    ON memories(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_documents_project_created
    ON documents(project_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_document_chunks_document_index
    ON document_chunks(document_id, chunk_index);

    CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
    ON sessions(token_hash);

    CREATE INDEX IF NOT EXISTS idx_sessions_user_expires
    ON sessions(user_id, expires_at DESC);
  `)
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

    // Load sqlite-vec extension (graceful — app works without it, just no RAG vector search)
    loadSqliteVecExtension(sqlite)
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
