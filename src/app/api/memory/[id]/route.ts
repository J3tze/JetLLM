import { NextResponse } from "next/server"
import { getMemory, updateMemory, deleteMemory } from "@/lib/memory"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const memory = getMemory(id)

  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 })
  }

  return NextResponse.json(memory)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const memory = getMemory(id)

  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 })
  }

  const body = await request.json()
  const { content, type } = body

  updateMemory(id, { content, type })
  const updated = getMemory(id)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const memory = getMemory(id)

  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 })
  }

  deleteMemory(id)
  return NextResponse.json({ success: true })
}
