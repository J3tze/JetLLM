import { NextResponse } from "next/server"
import { setSetting, getAllSettings } from "@/lib/settings"

export async function GET() {
  try {
    const settings = getAllSettings()
    // Filter out provider API keys from public GET response
    const publicSettings: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith("provider:")) continue
      publicSettings[key] = value
    }
    return NextResponse.json(publicSettings)
  } catch (error) {
    console.error("[settings] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { key, value } = body

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "key is required" }, { status: 400 })
    }

    setSetting(key, value)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    console.error("[settings] PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
