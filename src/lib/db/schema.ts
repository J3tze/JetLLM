import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  systemPrompt: text("system_prompt"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
})

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Chat"),
  model: text("model").notNull(),
  provider: text("provider").notNull(),
  systemPrompt: text("system_prompt"),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
})

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["fact", "preference", "summary"] }).notNull(),
  content: text("content").notNull(),
  sourceConversationId: text("source_conversation_id")
    .references(() => conversations.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: text("content").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  status: text("status", { enum: ["pending", "processing", "ready", "error"] })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})
