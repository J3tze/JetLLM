import { NextResponse } from "next/server"
import { getMemory, updateMemory, deleteMemory } from "@/lib/memory"
import { getCurrentUserFromRequest } from "@/lib/auth-server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const memory = getMemory(id, user.id)

  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 })
  }

  return NextResponse.json(memory)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const memory = getMemory(id, user.id)

  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 })
  }

  const body = await request.json()
  const { content, type } = body

  updateMemory(id, user.id, { content, type })
  const updated = getMemory(id, user.id)
  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const memory = getMemory(id, user.id)

  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 })
  }

  deleteMemory(id, user.id)
  return NextResponse.json({ success: true })
}
