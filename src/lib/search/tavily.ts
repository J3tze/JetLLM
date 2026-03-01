import { getSetting } from "@/lib/settings"

export type SearchResult = {
  title: string
  url: string
  content: string
}

const TAVILY_SEARCH_URL = "https://api.tavily.com/search"
const MAX_CONTENT_LENGTH = 1000
const SUMMARY_CONTENT_LENGTH = 220
const DEFAULT_LIMIT = 5
const TIMEOUT_MS = 10000

function normalizeSnippet(text: string): string {
  return text
    .replace(/\r?\n+/g, " ")
    .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/^#+\s+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function summarizeSnippet(text: string): string {
  const normalized = normalizeSnippet(text)
  if (!normalized) return ""
  if (normalized.length <= SUMMARY_CONTENT_LENGTH) return normalized

  const cutoff = normalized.slice(0, SUMMARY_CONTENT_LENGTH)
  const sentenceEnd = Math.max(cutoff.lastIndexOf("."), cutoff.lastIndexOf("!"), cutoff.lastIndexOf("?"))
  if (sentenceEnd > 80) {
    return cutoff.slice(0, sentenceEnd + 1).trim()
  }
  return cutoff.trim() + "..."
}

export async function searchWeb(query: string, limit: number = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const apiKey = getSetting<string>("search:tavilyKey")
  if (!apiKey) {
    throw new Error("Tavily API key not configured")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: limit,
        include_answer: false,
        search_depth: "basic",
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error")
      throw new Error(`Tavily API error (${res.status}): ${errorText}`)
    }

    const data = await res.json()
    const results: SearchResult[] = (data.results || []).map((item: { title?: string; url?: string; content?: string }) => ({
      title: item.title || "Untitled",
      url: item.url || "",
      content: (item.content || "").slice(0, MAX_CONTENT_LENGTH),
    }))

    return results
  } finally {
    clearTimeout(timeout)
  }
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return ""

  const keyFindings = results.map((r, idx) => {
    const summary = summarizeSnippet(r.content)
    return `- [${idx + 1}] ${r.title}: ${summary || "No summary available."}`
  }).join("\n")

  const references = results.map((r, idx) => {
    return `[${idx + 1}] ${r.title} - ${r.url}`
  }).join("\n")

  return [
    "## Web Search Brief",
    "Use the brief below as evidence. Paraphrase instead of copying snippets verbatim.",
    "",
    "Key findings:",
    keyFindings,
    "",
    "References:",
    references,
  ].join("\n")
}

export function formatSearchToolSummary(results: SearchResult[]): string {
  if (results.length === 0) {
    return "Key updates:\n- No web results found.\n\nReferences:\n- None"
  }

  const keyUpdates = results.map((r, idx) => {
    const summary = summarizeSnippet(r.content)
    return `- [${idx + 1}] ${r.title}: ${summary || "No summary available."}`
  }).join("\n")

  const references = results.map((r, idx) => {
    return `[${idx + 1}] ${r.title} - ${r.url}`
  }).join("\n")

  return [
    "Key updates:",
    keyUpdates,
    "",
    "References:",
    references,
  ].join("\n")
}
