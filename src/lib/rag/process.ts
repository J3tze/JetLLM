import { ulid } from "ulid"
import { chunkText } from "./chunker"
import { embedBatch } from "./embeddings"
import { getDb, getRawDb } from "@/lib/db"
import { eq } from "drizzle-orm"
import * as schema from "@/lib/db/schema"

/**
 * Process a document: chunk its content, generate embeddings, and store
 * both the text chunks and their vectors.
 *
 * Updates the document status through the lifecycle:
 *   pending → processing → ready  (or → error on failure)
 */
export async function processDocument(documentId: string): Promise<void> {
  const db = getDb()

  try {
    const doc = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId))
      .get()

    if (!doc) return

    // Mark as processing
    db.update(schema.documents)
      .set({ status: "processing" })
      .where(eq(schema.documents.id, documentId))
      .run()

    const chunks = chunkText(doc.content)

    if (chunks.length === 0) {
      db.update(schema.documents)
        .set({ status: "ready", chunkCount: 0 })
        .where(eq(schema.documents.id, documentId))
        .run()
      return
    }

    // Embed all chunks in a single batch API call
    const embeddings = await embedBatch(chunks)

    // Use the raw better-sqlite3 instance for sqlite-vec virtual table access
    const sqlite = getRawDb()

    const insertChunk = sqlite.prepare(
      "INSERT INTO document_chunks (id, document_id, chunk_index, content) VALUES (?, ?, ?, ?)"
    )
    const insertVec = sqlite.prepare(
      "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)"
    )

    const insertAll = sqlite.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = ulid()
        insertChunk.run(chunkId, documentId, i, chunks[i])
        insertVec.run(chunkId, new Float32Array(embeddings[i]))
      }
    })

    insertAll()

    // Mark document as ready with chunk count
    db.update(schema.documents)
      .set({ status: "ready", chunkCount: chunks.length })
      .where(eq(schema.documents.id, documentId))
      .run()
  } catch (error) {
    console.error(`[rag] Failed to process document ${documentId}:`, error)
    db.update(schema.documents)
      .set({ status: "error" })
      .where(eq(schema.documents.id, documentId))
      .run()
  }
}
