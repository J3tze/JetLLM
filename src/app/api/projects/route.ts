import { NextResponse } from "next/server"
import { listProjects, createProject } from "@/lib/projects"
import { getCurrentUserFromRequest } from "@/lib/auth-server"

export async function GET(request: Request) {
  try {
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const projects = listProjects(user.id)
    return NextResponse.json(projects)
  } catch (error) {
    console.error("Failed to list projects:", error)
    return NextResponse.json({ error: "Failed to list projects" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, icon } = body

    const project = createProject({ userId: user.id, name, icon })
    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    console.error("Failed to create project:", error)
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }
}
