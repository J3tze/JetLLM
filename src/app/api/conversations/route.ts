import { NextResponse } from "next/server"
import { listConversations, createConversation } from "@/lib/conversations"
import { getProject, getProjectConversations, getStandaloneConversations } from "@/lib/projects"
import { getCurrentUserFromRequest } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")

    let conversations
    if (projectId === "standalone") {
      conversations = getStandaloneConversations(user.id)
    } else if (projectId) {
      conversations = getProjectConversations(projectId, user.id)
    } else {
      conversations = listConversations(user.id)
    }

    return NextResponse.json(conversations)
  } catch (error) {
    console.error("Failed to list conversations:", error)
    return NextResponse.json({ error: "Failed to list conversations" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { model, provider, title, systemPrompt, projectId } = body

    if (!model || !provider) {
      return NextResponse.json(
        { error: "model and provider are required" },
        { status: 400 }
      )
    }

    if (projectId && !getProject(projectId, user.id)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const conversation = createConversation({ userId: user.id, model, provider, title, systemPrompt, projectId })
    return NextResponse.json(conversation, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    console.error("Failed to create conversation:", error)
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 })
  }
}
