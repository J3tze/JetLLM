import { NextResponse } from "next/server"
import { setSetting, getAllSettings } from "@/lib/settings"
import { getCurrentUserFromRequest } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

const PUBLIC_UNAUTH_KEYS = new Set<string>([
  "ui:accentColor",
  "ui:chatTheme",
])

export async function GET(request: Request) {
  try {
    const user = getCurrentUserFromRequest(request)
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
    const effectiveRequestedKeys = !user && !requestedKeys
      ? PUBLIC_UNAUTH_KEYS
      : requestedKeys

    const settings = getAllSettings()
    // Filter out provider API keys and avoid returning raw search secrets.
    const publicSettings: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(settings)) {
      if (effectiveRequestedKeys && !effectiveRequestedKeys.has(key)) continue
      if (!user && !PUBLIC_UNAUTH_KEYS.has(key)) continue
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
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
