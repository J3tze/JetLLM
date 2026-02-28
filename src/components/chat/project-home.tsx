"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ArrowLeft, Settings, Paperclip, X, Loader2, MessageSquare, SendHorizontal } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ProjectSettings } from "./project-settings"
import type { Project } from "@/hooks/use-projects"

type Document = {
  id: string
  projectId: string
  name: string
  status: "pending" | "processing" | "ready" | "error"
  chunkCount: number
  createdAt: string
}

type ConversationItem = {
  id: string
  title: string
  model: string
  provider: string
  createdAt: string
  updatedAt: string
}

type ProjectHomeProps = {
  project: Project
  onBack: () => void
  onOpenConversation: (id: string) => void
  onNewConversation: (text: string) => void
  onUpdateProject: (data: Partial<Pick<Project, "name" | "icon" | "systemPrompt">>) => void
}

export function ProjectHome({
  project,
  onBack,
  onOpenConversation,
  onNewConversation,
  onUpdateProject,
}: ProjectHomeProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch documents for this project
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/documents`, { cache: "no-store" })
      if (res.ok) {
        setDocuments(await res.json())
      }
    } catch {
      // ignore
    }
  }, [project.id])

  // Fetch conversations for this project
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?projectId=${project.id}`, { cache: "no-store" })
      if (res.ok) {
        setConversations(await res.json())
      }
    } catch {
      // ignore
    }
  }, [project.id])

  useEffect(() => {
    fetchDocuments()
    fetchConversations()
  }, [fetchDocuments, fetchConversations])

  // Poll for processing documents
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === "processing" || d.status === "pending")
    if (!hasProcessing) return
    const timer = setInterval(fetchDocuments, 3000)
    return () => clearInterval(timer)
  }, [documents, fetchDocuments])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/projects/${project.id}/documents`, {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        await fetchDocuments()
      } else {
        const err = await res.json().catch(() => ({}))
        setUploadError(typeof err.error === "string" ? err.error : "Failed to upload file")
      }
    } catch {
      setUploadError("Failed to upload file")
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    try {
      await fetch(`/api/projects/${project.id}/documents/${docId}`, {
        method: "DELETE",
      })
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch {
      // ignore
    }
  }

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onNewConversation(trimmed)
    setInputValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [inputValue, onNewConversation])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = "auto"
    target.style.height = `${target.scrollHeight}px`
  }

  const hasErroredDocuments = documents.some(d => d.status === "error")

  return (
    <div className="flex flex-col h-full safe-area-top">
      {/* Header */}
      <div className="px-4 pt-2 pb-3 flex items-center gap-3">
        <SidebarTrigger className="h-8 w-8" />
        <button
          onClick={onBack}
          className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-xl leading-none">{project.icon || "\u{1F4C1}"}</span>
        <h2 className="text-lg font-semibold truncate flex-1">{project.name}</h2>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Main content */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 pb-6 space-y-6">
          {/* Chat input */}
          <div>
            <div className="flex items-end rounded-xl border border-border/50 bg-white/[0.03] overflow-hidden">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                placeholder="Start a new conversation..."
                rows={1}
                className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className={`flex items-center justify-center h-11 w-11 shrink-0 transition-colors ${
                  inputValue.trim()
                    ? "text-primary hover:text-primary/80"
                    : "text-muted-foreground/30"
                }`}
              >
                <SendHorizontal className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Files section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Files</h3>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
                <span>Add file</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept=".txt,.md,.ts,.js,.py,.json,.yaml,.yml,.toml,.csv,.xml,.html,.css,.rs,.go,.java,.c,.cpp,.h,.sh,.sql,.env,.cfg,.ini,.log,.jsx,.tsx"
              />
            </div>
            {documents.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-1.5 rounded-md border border-border/50 bg-white/[0.03] px-2.5 py-1.5 text-sm"
                  >
                    <span className="text-xs">{"\u{1F4C4}"}</span>
                    <span className="truncate max-w-[160px]">{doc.name}</span>
                    {(doc.status === "processing" || doc.status === "pending") && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />
                    )}
                    {doc.status === "error" && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-destructive/90">failed</span>
                    )}
                    {(doc.status === "ready" || doc.status === "error") && (
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="flex items-center justify-center h-4 w-4 rounded text-muted-foreground hover:text-foreground transition-colors ml-1"
                        title="Remove file"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">
                No files uploaded. Add files for RAG context in conversations.
              </p>
            )}
            {hasErroredDocuments && (
              <p className="text-xs text-amber-400/90">
                Some files failed indexing. Configure Knowledge Base settings, then remove and re-add the file.
              </p>
            )}
            {uploadError && (
              <p className="text-xs text-destructive/90">{uploadError}</p>
            )}
          </div>

          {/* Recent conversations */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recent Conversations</h3>
            {conversations.length > 0 ? (
              <div className="space-y-1">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => onOpenConversation(conv.id)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate text-sm">{conv.title}</span>
                    <span className="text-[11px] text-muted-foreground/60 ml-auto shrink-0">
                      {formatDate(conv.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">
                No conversations yet. Type a message above to start one.
              </p>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Project settings modal */}
      <ProjectSettings
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSave={(data) => onUpdateProject(data)}
      />
    </div>
  )
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
