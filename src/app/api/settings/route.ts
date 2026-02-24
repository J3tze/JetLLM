import { NextResponse } from "next/server"
import { getSetting, setSetting, getAllSettings } from "@/lib/settings"

export async function GET() {
  const settings = getAllSettings()
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { key, value } = body

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 })
  }

  setSetting(key, value)
  return NextResponse.json({ success: true })
}
