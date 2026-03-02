import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto"
import { and, eq, gt } from "drizzle-orm"
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { ulid } from "ulid"
import * as schema from "@/lib/db/schema"
import { getDb } from "@/lib/db"

export const SESSION_COOKIE_NAME = "jetllm_session"
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

const PASSWORD_HASH_VERSION = "scrypt-v1"
const PASSWORD_SALT_BYTES = 16
const PASSWORD_KEY_LENGTH = 64

export type User = typeof schema.users.$inferSelect
export type SafeUser = Omit<User, "passwordHash">

type CreateUserInput = {
  email: string
  displayName: string
  password: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function toSafeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safeUser } = user
  return safeUser
}

export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex")
  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex")
  return `${PASSWORD_HASH_VERSION}$${salt}$${derived}`
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [version, salt, stored] = passwordHash.split("$")
  if (version !== PASSWORD_HASH_VERSION || !salt || !stored) return false

  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH)
  const storedBuffer = Buffer.from(stored, "hex")

  if (derived.length !== storedBuffer.length) return false
  return timingSafeEqual(derived, storedBuffer)
}

export function validateEmailInput(email: string): string | null {
  const normalized = normalizeEmail(email)
  if (!normalized) return "Email is required"

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(normalized)) return "Please enter a valid email address"

  return null
}

export function validatePasswordInput(password: string): string | null {
  if (!password) return "Password is required"
  if (password.length < 8) return "Password must be at least 8 characters"
  return null
}

export function validateDisplayNameInput(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return "Display name is required"
  if (trimmed.length > 80) return "Display name must be 80 characters or less"
  return null
}

export function createAuthService(db: BetterSQLite3Database<typeof schema>) {
  return {
    createUser(input: CreateUserInput): SafeUser {
      const email = normalizeEmail(input.email)
      const displayName = input.displayName.trim()
      const id = ulid()
      const now = new Date()

      db.insert(schema.users)
        .values({
          id,
          email,
          displayName,
          passwordHash: hashPassword(input.password),
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const user = db.select().from(schema.users).where(eq(schema.users.id, id)).get()
      if (!user) {
        throw new Error("Failed to create user")
      }

      return toSafeUser(user)
    },

    getUserByEmail(email: string): SafeUser | null {
      const normalized = normalizeEmail(email)
      const user = db.select().from(schema.users).where(eq(schema.users.email, normalized)).get()
      return user ? toSafeUser(user) : null
    },

    validateCredentials(email: string, password: string): SafeUser | null {
      const normalized = normalizeEmail(email)
      const user = db.select().from(schema.users).where(eq(schema.users.email, normalized)).get()
      if (!user) return null
      if (!verifyPassword(password, user.passwordHash)) return null
      return toSafeUser(user)
    },

    createSession(userId: string): { id: string; token: string; expiresAt: Date } {
      const id = ulid()
      const token = randomBytes(32).toString("hex")
      const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

      db.insert(schema.sessions)
        .values({
          id,
          userId,
          tokenHash: hashSessionToken(token),
          expiresAt,
          createdAt: new Date(),
        })
        .run()

      return { id, token, expiresAt }
    },

    getUserFromSessionToken(token: string): SafeUser | null {
      if (!token) return null

      const row = db
        .select({
          user: schema.users,
        })
        .from(schema.sessions)
        .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
        .where(
          and(
            eq(schema.sessions.tokenHash, hashSessionToken(token)),
            gt(schema.sessions.expiresAt, new Date())
          )
        )
        .get()

      return row ? toSafeUser(row.user) : null
    },

    invalidateSessionByToken(token: string): void {
      if (!token) return
      db.delete(schema.sessions)
        .where(eq(schema.sessions.tokenHash, hashSessionToken(token)))
        .run()
    },

    invalidateUserSessions(userId: string): void {
      db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run()
    },
  }
}

export function createUser(input: CreateUserInput): SafeUser {
  return createAuthService(getDb()).createUser(input)
}

export function getUserByEmail(email: string): SafeUser | null {
  return createAuthService(getDb()).getUserByEmail(email)
}

export function validateCredentials(email: string, password: string): SafeUser | null {
  return createAuthService(getDb()).validateCredentials(email, password)
}

export function createSession(userId: string): { id: string; token: string; expiresAt: Date } {
  return createAuthService(getDb()).createSession(userId)
}

export function getUserFromSessionToken(token: string): SafeUser | null {
  return createAuthService(getDb()).getUserFromSessionToken(token)
}

export function invalidateSessionByToken(token: string): void {
  return createAuthService(getDb()).invalidateSessionByToken(token)
}
