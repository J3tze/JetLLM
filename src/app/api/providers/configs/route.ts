import { NextResponse } from "next/server"
import { getSetting, setSetting } from "@/lib/settings"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"

export const dynamic = "force-dynamic"

const VALID_PROVIDER_IDS = new Set(PROVIDER_REGISTRY.map(p => p.id))
const MASKED_KEY_PATTERN = /^\*+$/

type StoredProviderConfig = {
  apiKey?: string
  baseUrl?: string
  models?: string[]
}

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
 * Body: { providerId: string, config: { apiKey?: string, baseUrl?: string } }
 */
export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { providerId, config } = body as { providerId?: string; config?: unknown }

    if (!providerId || !VALID_PROVIDER_IDS.has(providerId)) {
      return NextResponse.json({ error: "Invalid provider ID" }, { status: 400 })
    }

    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return NextResponse.json({ error: "Invalid config object" }, { status: 400 })
    }

    const incoming = config as StoredProviderConfig
    const existing = getSetting<StoredProviderConfig>(`provider:${providerId}`) ?? {}

    const existingApiKey = typeof existing.apiKey === "string" ? existing.apiKey.trim() : ""
    const rawIncomingApiKey = typeof incoming.apiKey === "string" ? incoming.apiKey.trim() : undefined
    const shouldPreserveApiKey =
      rawIncomingApiKey === undefined ||
      rawIncomingApiKey.length === 0 ||
      MASKED_KEY_PATTERN.test(rawIncomingApiKey)

    const nextApiKey = shouldPreserveApiKey ? existingApiKey : rawIncomingApiKey
    const rawIncomingBaseUrl = typeof incoming.baseUrl === "string" ? incoming.baseUrl.trim() : undefined
    const rawExistingBaseUrl = typeof existing.baseUrl === "string" ? existing.baseUrl.trim() : undefined
    const nextBaseUrl = rawIncomingBaseUrl === undefined ? rawExistingBaseUrl : rawIncomingBaseUrl

    const mergedConfig: StoredProviderConfig = { ...existing }
    if (nextApiKey) {
      mergedConfig.apiKey = nextApiKey
    } else {
      delete mergedConfig.apiKey
    }
    if (nextBaseUrl) {
      mergedConfig.baseUrl = nextBaseUrl
    } else {
      delete mergedConfig.baseUrl
    }

    setSetting(`provider:${providerId}`, mergedConfig)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    console.error("[providers/configs] PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
