import { NextResponse } from "next/server"
import { getSetting, setSetting } from "@/lib/settings"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"

const VALID_PROVIDER_IDS = new Set(PROVIDER_REGISTRY.map(p => p.id))

/**
 * GET /api/providers/configs
 * Returns provider configs with API keys masked for display.
 * Only shows whether a key is configured (masked) or not.
 */
export async function GET() {
  try {
    const configs: Record<string, { hasKey: boolean; baseUrl?: string }> = {}
    for (const p of PROVIDER_REGISTRY) {
      const config = getSetting<{ apiKey?: string; baseUrl?: string }>(`provider:${p.id}`)
      configs[p.id] = {
        hasKey: !!config?.apiKey,
        baseUrl: config?.baseUrl,
      }
    }
    return NextResponse.json(configs)
  } catch (error) {
    console.error("[providers/configs] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * PUT /api/providers/configs
 * Save provider config (API key + optional base URL).
 * Body: { providerId: string, config: { apiKey: string, baseUrl?: string } }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { providerId, config } = body

    if (!providerId || !VALID_PROVIDER_IDS.has(providerId)) {
      return NextResponse.json({ error: "Invalid provider ID" }, { status: 400 })
    }

    setSetting(`provider:${providerId}`, config)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    console.error("[providers/configs] PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
