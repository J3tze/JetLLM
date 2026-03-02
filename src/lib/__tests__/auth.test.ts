import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { eq } from "drizzle-orm"
import * as schema from "@/lib/db/schema"
import { createAuthService, SESSION_TTL_SECONDS } from "@/lib/auth"

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

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  return { db, sqlite }
}

describe("auth service", () => {
  let db: ReturnType<typeof createTestDb>["db"]
  let sqlite: Database.Database

  beforeEach(() => {
    const testDb = createTestDb()
    db = testDb.db
    sqlite = testDb.sqlite
  })

  afterEach(() => {
    sqlite.close()
  })

  it("creates a user with normalized email and hashed password", () => {
    const auth = createAuthService(db)

    const user = auth.createUser({
      email: "  PERSON@Example.com  ",
      displayName: "Person",
      password: "supersecret123",
    })

    expect(user.email).toBe("person@example.com")
    expect(user.displayName).toBe("Person")
    expect(user).not.toHaveProperty("passwordHash")

    const stored = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .get()

    expect(stored?.passwordHash).toBeTruthy()
    expect(stored?.passwordHash).not.toBe("supersecret123")
  })

  it("validates credentials for correct password only", () => {
    const auth = createAuthService(db)
    auth.createUser({
      email: "person@example.com",
      displayName: "Person",
      password: "supersecret123",
    })

    const valid = auth.validateCredentials("person@example.com", "supersecret123")
    const invalid = auth.validateCredentials("person@example.com", "wrong-password")

    expect(valid?.email).toBe("person@example.com")
    expect(invalid).toBeNull()
  })

  it("creates and resolves sessions while keeping raw token out of the database", () => {
    const auth = createAuthService(db)
    const user = auth.createUser({
      email: "person@example.com",
      displayName: "Person",
      password: "supersecret123",
    })

    const session = auth.createSession(user.id)
    const nowSec = Math.floor(Date.now() / 1000)
    const expiresSec = Math.floor(session.expiresAt.getTime() / 1000)

    expect(expiresSec - nowSec).toBeGreaterThanOrEqual(SESSION_TTL_SECONDS - 3)

    const stored = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, session.id))
      .get()

    expect(stored).toBeTruthy()
    expect(stored?.tokenHash).toBeTruthy()
    expect(stored?.tokenHash).not.toBe(session.token)

    const resolved = auth.getUserFromSessionToken(session.token)
    expect(resolved?.id).toBe(user.id)
    expect(resolved?.email).toBe("person@example.com")
  })

  it("invalidates a session token", () => {
    const auth = createAuthService(db)
    const user = auth.createUser({
      email: "person@example.com",
      displayName: "Person",
      password: "supersecret123",
    })
    const session = auth.createSession(user.id)

    auth.invalidateSessionByToken(session.token)

    const resolved = auth.getUserFromSessionToken(session.token)
    expect(resolved).toBeNull()
  })
})
