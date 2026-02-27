"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatPanel } from "@/components/chat/chat-panel"
import { ProjectHome } from "@/components/chat/project-home"
import { useConversations } from "@/hooks/use-conversations"
import { useProjects, type Project } from "@/hooks/use-projects"
import { useSwipeSidebar } from "@/hooks/use-swipe-sidebar"

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const { conversations, deleteConversation, refresh } = useConversations()
  const { projects, createProject, deleteProject, updateProject, refresh: refreshProjects } = useProjects()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  // Filter standalone conversations (no projectId)
  const standaloneConversations = useMemo(() => {
    return conversations.filter(c => !c.projectId)
  }, [conversations])

  const handleNew = useCallback(() => {
    setActiveId(null)
    setActiveProjectId(null)
  }, [])

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
    setActiveProjectId(null)
  }, [])

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id)
    setActiveId(null)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await deleteConversation(id)
    if (activeId === id) {
      setActiveId(null)
    }
  }, [activeId, deleteConversation])

  const handleNewProject = useCallback(async () => {
    const project = await createProject()
    setActiveProjectId(project.id)
    setActiveId(null)
  }, [createProject])

  const handleDeleteProject = useCallback(async (id: string) => {
    await deleteProject(id)
    if (activeProjectId === id) {
      setActiveProjectId(null)
    }
    // Refresh conversations since some may have been orphaned
    refresh()
  }, [activeProjectId, deleteProject, refresh])

  const handleConversationCreated = useCallback((id: string) => {
    setActiveId(id)
    refresh()
  }, [refresh])

  const handleProjectBack = useCallback(() => {
    setActiveProjectId(null)
  }, [])

  const handleProjectOpenConversation = useCallback((id: string) => {
    setActiveId(id)
    // Keep activeProjectId so the sidebar shows the project as active
  }, [])

  const handleProjectNewConversation = useCallback(async (text: string) => {
    if (!activeProjectId) return
    // Create conversation via ChatPanel auto-create flow:
    // We set up state so ChatPanel will create the conversation with the projectId
    // For now, we transition to a new chat panel with the first message
    // The ChatPanel will handle auto-creating the conversation
    setActiveId(null)
    // We need to pass the projectId and initial message to ChatPanel
    // Use a special state to signal ChatPanel should create a project conversation
    setProjectInitMessage({ projectId: activeProjectId, text })
  }, [activeProjectId])

  const [projectInitMessage, setProjectInitMessage] = useState<{ projectId: string; text: string } | null>(null)

  const handleUpdateProject = useCallback(async (id: string, data: Partial<Pick<Project, "name" | "icon" | "systemPrompt">>) => {
    // Filter out null/undefined icon before passing to updateProject
    const updateData: Partial<{ name: string; icon: string; systemPrompt: string | null }> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.icon !== undefined && data.icon !== null) updateData.icon = data.icon
    if (data.systemPrompt !== undefined) updateData.systemPrompt = data.systemPrompt
    await updateProject(id, updateData)
    refreshProjects()
  }, [updateProject, refreshProjects])

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null
    return projects.find(p => p.id === activeProjectId) || null
  }, [activeProjectId, projects])

  // Render nothing on server -- prevents hydration mismatch from browser
  // extensions (e.g. Dark Reader) that modify DOM before React hydrates
  if (!mounted) return null

  function SwipeHandler() {
    const { setOpenMobile } = useSidebar()
    const openMobile = useCallback(() => setOpenMobile(true), [setOpenMobile])
    useSwipeSidebar(openMobile)
    return null
  }

  // Determine what to render in the main area
  const showProjectHome = activeProjectId && !activeId && activeProject

  return (
    <SidebarProvider>
      <ChatSidebar
        conversations={standaloneConversations}
        projects={projects}
        activeId={activeId}
        activeProjectId={activeProjectId}
        onSelect={handleSelect}
        onSelectProject={handleSelectProject}
        onNew={handleNew}
        onNewProject={handleNewProject}
        onDelete={handleDelete}
        onDeleteProject={handleDeleteProject}
      />
      <SwipeHandler />
      <SidebarInset>
        {showProjectHome ? (
          <ProjectHome
            project={activeProject}
            onBack={handleProjectBack}
            onOpenConversation={handleProjectOpenConversation}
            onNewConversation={handleProjectNewConversation}
            onUpdateProject={(data) => handleUpdateProject(activeProject.id, data)}
          />
        ) : (
          <ChatPanel
            conversationId={activeId}
            onConversationCreated={handleConversationCreated}
            projectId={activeProjectId}
            projectInitMessage={projectInitMessage}
            onProjectInitConsumed={() => setProjectInitMessage(null)}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
