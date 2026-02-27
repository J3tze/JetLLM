import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { getDb, getRawDb } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { getProject } from "@/lib/projects"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params
    const project = getProject(id)

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const db = getDb()
    const doc = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .get()

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    if (doc.projectId !== id) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Delete vector embeddings first (virtual tables don't cascade)
    const sqlite = getRawDb()
    sqlite
      .prepare(
        "DELETE FROM vec_chunks WHERE chunk_id IN (SELECT id FROM document_chunks WHERE document_id = ?)"
      )
      .run(docId)

    // Delete the document (cascades to document_chunks via FK)
    db.delete(schema.documents)
      .where(eq(schema.documents.id, docId))
      .run()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete document:", error)
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    )
  }
}
