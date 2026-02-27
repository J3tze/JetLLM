export interface ChunkOptions {
  /** Max characters per chunk. Default 2000 (~500 tokens at 4 chars/token). */
  maxChars?: number
  /** Characters of overlap between consecutive chunks. Default 200 (~50 tokens). */
  overlap?: number
}

/**
 * Split text into chunks suitable for embedding.
 *
 * Strategy:
 * 1. If text fits in one chunk, return [text].
 * 2. Split on double newlines (paragraphs) first.
 * 3. Accumulate paragraphs until maxChars exceeded, then start a new chunk.
 * 4. If a single paragraph exceeds maxChars, split on single newlines,
 *    then on sentence boundaries (". ", "? ", "! ").
 * 5. After all chunks created, add overlap (tail of previous chunk prepended to next).
 * 6. Return empty array for empty/whitespace input.
 */
export function chunkText(text: string, options?: ChunkOptions): string[] {
  const maxChars = options?.maxChars ?? 2000
  const overlap = options?.overlap ?? 200

  // Empty / whitespace-only input
  if (!text || !text.trim()) {
    return []
  }

  const trimmed = text.trim()

  // Fits in a single chunk
  if (trimmed.length <= maxChars) {
    return [trimmed]
  }

  // --- Phase 1: split into paragraph-level segments ---
  const paragraphs = trimmed.split(/\n\n+/)

  // Break any oversized paragraphs into smaller pieces
  const segments: string[] = []
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      segments.push(para)
    } else {
      // Try splitting on single newlines first
      const lines = para.split(/\n/)
      for (const line of lines) {
        if (line.length <= maxChars) {
          segments.push(line)
        } else {
          // Split on sentence boundaries
          const sentences = splitOnSentences(line)
          for (const sentence of sentences) {
            if (sentence.length <= maxChars) {
              segments.push(sentence)
            } else {
              // Last resort: hard-split at maxChars
              hardSplit(sentence, maxChars, segments)
            }
          }
        }
      }
    }
  }

  // --- Phase 2: accumulate segments into raw chunks ---
  const rawChunks: string[] = []
  let current = ""

  for (const segment of segments) {
    if (current.length === 0) {
      current = segment
    } else {
      const combined = current + "\n\n" + segment
      if (combined.length <= maxChars) {
        current = combined
      } else {
        rawChunks.push(current.trim())
        current = segment
      }
    }
  }
  if (current.trim().length > 0) {
    rawChunks.push(current.trim())
  }

  // --- Phase 3: add overlap ---
  if (rawChunks.length <= 1 || overlap <= 0) {
    return rawChunks
  }

  const result: string[] = [rawChunks[0]]
  for (let i = 1; i < rawChunks.length; i++) {
    const prev = rawChunks[i - 1]
    const tail = prev.slice(-overlap)
    result.push(tail + "\n\n" + rawChunks[i])
  }

  return result
}

/** Split a string on sentence boundaries (". ", "? ", "! "). */
function splitOnSentences(text: string): string[] {
  const parts: string[] = []
  // Match sentence-ending punctuation followed by a space
  const regex = /([.?!])\s+/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Include the punctuation in the segment
    parts.push(text.slice(lastIndex, match.index + 1))
    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.filter((p) => p.length > 0)
}

/** Hard-split a string into pieces of at most `maxChars`. */
function hardSplit(text: string, maxChars: number, out: string[]): void {
  let i = 0
  while (i < text.length) {
    out.push(text.slice(i, i + maxChars))
    i += maxChars
  }
}
