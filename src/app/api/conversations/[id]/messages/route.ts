import { NextResponse } from "next/server"
import { addMessage, getConversation, getMessages } from "@/lib/conversations"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const messages = getMessages(id)
  if (messages.length > 0) {
    return NextResponse.json(messages)
  }

  const conversation = getConversation(id)
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  return NextResponse.json(messages)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conversation = getConversation(id)

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const body = await request.json()
  const message = addMessage({
    conversationId: id,
    role: body.role,
    content: body.content,
  })
  return NextResponse.json(message, { status: 201 })
}
