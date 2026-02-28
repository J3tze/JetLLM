import { NextResponse } from "next/server"
import { listConversations, createConversation } from "@/lib/conversations"
import { getProjectConversations, getStandaloneConversations } from "@/lib/projects"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")

    let conversations
    if (projectId === "standalone") {
      conversations = getStandaloneConversations()
    } else if (projectId) {
      conversations = getProjectConversations(projectId)
    } else {
      conversations = listConversations()
    }

    return NextResponse.json(conversations)
  } catch (error) {
    console.error("Failed to list conversations:", error)
    return NextResponse.json({ error: "Failed to list conversations" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { model, provider, title, systemPrompt, projectId } = body

    if (!model || !provider) {
      return NextResponse.json(
        { error: "model and provider are required" },
        { status: 400 }
      )
    }

    const conversation = createConversation({ model, provider, title, systemPrompt, projectId })
    return NextResponse.json(conversation, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    console.error("Failed to create conversation:", error)
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 })
  }
}
