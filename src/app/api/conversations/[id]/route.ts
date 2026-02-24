import { NextResponse } from "next/server"
import { getConversation, updateConversation, deleteConversation } from "@/lib/conversations"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conversation = getConversation(id)

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  return NextResponse.json(conversation)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conversation = getConversation(id)

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const body = await request.json()
  const { title, model, provider, systemPrompt } = body

  updateConversation(id, { title, model, provider, systemPrompt })
  const updated = getConversation(id)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conversation = getConversation(id)

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  deleteConversation(id)
  return NextResponse.json({ success: true })
}
