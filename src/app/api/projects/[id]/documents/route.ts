import { NextResponse } from "next/server"
import { ulid } from "ulid"
import { eq, desc } from "drizzle-orm"
import { getDb } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { getProject } from "@/lib/projects"
import { processDocument } from "@/lib/rag/process"
import { getSetting, type ProviderConfig } from "@/lib/settings"
import { getCurrentUserFromRequest } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

const ALLOWED_EXTENSIONS = new Set([
  "txt", "md", "ts", "js", "py", "json", "yaml", "yml", "toml", "csv",
  "xml", "html", "css", "rs", "go", "java", "c", "cpp", "h", "sh",
  "sql", "env", "cfg", "ini", "log", "jsx", "tsx",
])

function getExtension(filename: string): string {
  const parts = filename.split(".")
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ""
}

type RagModelConfig = {
  provider: string
  model: string
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const project = getProject(id)

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const db = getDb()
    const documents = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.projectId, id))
      .orderBy(desc(schema.documents.createdAt))
      .all()

    return NextResponse.json(documents)
  } catch (error) {
    console.error("Failed to list documents:", error)
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const project = getProject(id)

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // RAG requires an embedding model and provider key to index files.
    const ragModel = getSetting<RagModelConfig>("rag:model")
    if (!ragModel?.provider || !ragModel?.model) {
      return NextResponse.json(
        { error: "Configure a Knowledge Base embedding model in Settings before uploading files." },
        { status: 400 }
      )
    }

    const ragProvider = getSetting<ProviderConfig>(`provider:${ragModel.provider}`)
    if (!ragProvider?.apiKey) {
      return NextResponse.json(
        { error: `Provider "${ragModel.provider}" is selected for Knowledge Base but has no API key configured.` },
        { status: 400 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5 MB." },
        { status: 400 }
      )
    }

    // Validate extension
    const ext = getExtension(file.name)
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type ".${ext}" is not allowed` },
        { status: 400 }
      )
    }

    // Read file content as UTF-8 text
    const content = await file.text()

    if (!content.trim()) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 }
      )
    }

    // Insert document record
    const db = getDb()
    const docId = ulid()

    db.insert(schema.documents)
      .values({
        id: docId,
        projectId: id,
        name: file.name,
        content,
        status: "processing",
        createdAt: new Date(),
      })
      .run()

    // Fire-and-forget processing
    processDocument(docId).catch((err) => {
      console.error(`[rag] Background processing failed for ${docId}:`, err)
    })

    const doc = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .get()

    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error("Failed to upload document:", error)
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 }
    )
  }
}
