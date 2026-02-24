import { NextResponse } from "next/server"
import { getConversation, getMessages } from "@/lib/conversations"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conversation = getConversation(id)

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const messages = getMessages(id)
  return NextResponse.json(messages)
}
