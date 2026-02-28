import { NextResponse } from "next/server"
import { setSetting, getAllSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const keysParam = searchParams.get("keys")
    const requestedKeys = keysParam
      ? new Set(
        keysParam
          .split(",")
          .map(k => k.trim())
          .filter(Boolean)
      )
      : null

    const settings = getAllSettings()
    // Filter out provider API keys and avoid returning raw search secrets.
    const publicSettings: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(settings)) {
      if (requestedKeys && !requestedKeys.has(key)) continue
      if (key.startsWith("provider:")) continue
      if (key === "search:tavilyKey") {
        publicSettings[key] = Boolean(value)
        continue
      }
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
