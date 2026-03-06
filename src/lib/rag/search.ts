import { embedSingle, type EmbeddingModelConfig } from "./embeddings"
import { getRawDb } from "@/lib/db"

export type SearchResult = {
  chunkId: string
  content: string
  distance: number
}

/**
 * Search documents within a project using vector similarity.
 *
 * Embeds the query text, then performs a nearest-neighbour lookup via the
 * sqlite-vec `vec_chunks` virtual table, joining back to `document_chunks`
 * and filtering to only documents belonging to the given project that have
 * finished processing (status = 'ready').
 */
export async function searchDocuments(
  projectId: string,
  query: string,
  topK = 5,
  options: { embeddingConfig?: EmbeddingModelConfig } = {}
): Promise<SearchResult[]> {
  const safeTopK = Number.isFinite(topK)
    ? Math.max(1, Math.min(20, Math.trunc(topK)))
    : 5
  const queryEmbedding = await embedSingle(query, options.embeddingConfig)
  const sqlite = getRawDb()

  const results = sqlite
    .prepare(
      `
      SELECT vc.chunk_id, dc.content, vc.distance
      FROM vec_chunks vc
      JOIN document_chunks dc ON dc.id = vc.chunk_id
      JOIN documents d ON d.id = dc.document_id
      WHERE d.project_id = ?
        AND d.status = 'ready'
        AND vc.embedding MATCH ?
        AND k = ?
      ORDER BY vc.distance
      `
    )
    .all(projectId, new Float32Array(queryEmbedding), safeTopK)

  return results as SearchResult[]
}

/**
 * Format search results into a context string suitable for injection into
 * an LLM system prompt.  Truncated at ~8000 characters (~2000 tokens).
 */
export function formatRagContext(results: SearchResult[]): string {
  if (results.length === 0) return ""

  let context = "Relevant information from project documents:\n"
  for (const r of results) {
    context += `---\n${r.content}\n`
  }
  return context.slice(0, 8000)
}
