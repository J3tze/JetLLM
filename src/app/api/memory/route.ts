import { NextResponse } from "next/server"
import { listMemories, createMemory } from "@/lib/memory"

export async function GET() {
  const memories = listMemories()
  return NextResponse.json(memories)
}

export async function POST(request: Request) {
  const body = await request.json()
  const { type, content } = body

  if (!type || !content) {
    return NextResponse.json(
      { error: "type and content are required" },
      { status: 400 }
    )
  }

  if (!["fact", "preference", "summary"].includes(type)) {
    return NextResponse.json(
      { error: "type must be fact, preference, or summary" },
      { status: 400 }
    )
  }

  const memory = createMemory({ type, content })
  return NextResponse.json(memory, { status: 201 })
}
