import { NextResponse } from "next/server"
import { listConversations, createConversation } from "@/lib/conversations"

export async function GET() {
  const conversations = listConversations()
  return NextResponse.json(conversations)
}

export async function POST(request: Request) {
  const body = await request.json()
  const { model, provider, title, systemPrompt } = body

  if (!model || !provider) {
    return NextResponse.json(
      { error: "model and provider are required" },
      { status: 400 }
    )
  }

  const conversation = createConversation({ model, provider, title, systemPrompt })
  return NextResponse.json(conversation, { status: 201 })
}
