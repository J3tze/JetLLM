import { NextResponse } from "next/server"
import { listProjects, createProject } from "@/lib/projects"

export async function GET() {
  try {
    const projects = listProjects()
    return NextResponse.json(projects)
  } catch (error) {
    console.error("Failed to list projects:", error)
    return NextResponse.json({ error: "Failed to list projects" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, icon } = body

    const project = createProject({ name, icon })
    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    console.error("Failed to create project:", error)
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }
}
