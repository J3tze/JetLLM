import { NextResponse } from "next/server"
import { addMessage, getConversation, getMessages } from "@/lib/conversations"
import { getCurrentUserFromRequest } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const conversation = getConversation(id, user.id)
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const messages = getMessages(id, user.id)
  return NextResponse.json(messages)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const conversation = getConversation(id, user.id)

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const body = await request.json() as {
    role?: unknown
    content?: unknown
    metadata?: unknown
    toolCalls?: unknown
  }

  if (typeof body.role !== "string") {
    return NextResponse.json({ error: "role is required" }, { status: 400 })
  }

  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 })
  }

  if (body.metadata != null && typeof body.metadata !== "string") {
    return NextResponse.json({ error: "metadata must be a string" }, { status: 400 })
  }

  if (body.toolCalls != null && typeof body.toolCalls !== "string") {
    return NextResponse.json({ error: "toolCalls must be a string" }, { status: 400 })
  }

  const validRoles = new Set(["user", "assistant", "system", "tool"])
  if (!validRoles.has(body.role)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 })
  }

  const metadata = typeof body.metadata === "string" ? body.metadata : undefined
  const toolCalls = typeof body.toolCalls === "string" ? body.toolCalls : undefined

  const message = addMessage({
    userId: user.id,
    conversationId: id,
    role: body.role as "user" | "assistant" | "system" | "tool",
    content: body.content,
    ...(toolCalls ? { toolCalls } : {}),
    metadata,
  })
  return NextResponse.json(message, { status: 201 })
}
