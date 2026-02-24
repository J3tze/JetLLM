import { NextRequest, NextResponse } from "next/server"

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

type OpenRouterModel = {
  id: string
  name: string
}

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider")

  if (provider !== "openrouter") {
    return NextResponse.json({ models: [] })
  }

  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      next: { revalidate: 3600 }, // cache for 1 hour
    })

    if (!res.ok) {
      return NextResponse.json({ models: [] })
    }

    const data = await res.json()
    const models: string[] = (data.data as OpenRouterModel[])
      .map((m) => m.id)
      .sort()

    return NextResponse.json({ models })
  } catch {
    return NextResponse.json({ models: [] })
  }
}
