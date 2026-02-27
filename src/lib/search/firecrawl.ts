import { getSetting } from "@/lib/settings"

export type SearchResult = {
  title: string
  url: string
  content: string
}

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search"
const MAX_CONTENT_LENGTH = 1000
const DEFAULT_LIMIT = 5
const TIMEOUT_MS = 10000

export async function searchWeb(query: string, limit: number = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const apiKey = getSetting<string>("search:firecrawlKey")
  if (!apiKey) {
    throw new Error("Firecrawl API key not configured")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error")
      throw new Error(`Firecrawl API error (${res.status}): ${errorText}`)
    }

    const data = await res.json()
    const results: SearchResult[] = (data.data || []).map((item: { title?: string; url?: string; markdown?: string }) => ({
      title: item.title || "Untitled",
      url: item.url || "",
      content: (item.markdown || "").slice(0, MAX_CONTENT_LENGTH),
    }))

    return results
  } finally {
    clearTimeout(timeout)
  }
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return ""

  const formatted = results.map(r =>
    `### [${r.title}](${r.url})\n${r.content}`
  ).join("\n\n")

  return `## Web Search Results\nThe following search results were retrieved for the user's query. Use these to inform your response. Cite sources when relevant.\n\n${formatted}`
}
