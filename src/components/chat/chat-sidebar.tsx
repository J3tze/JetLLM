"use client"

import { Plus, Trash2, MessageSquare, Settings, FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from "@/components/ui/sidebar"
import type { Conversation } from "@/hooks/use-conversations"
import type { Project } from "@/hooks/use-projects"

type ChatSidebarProps = {
  conversations: Conversation[]
  projects: Project[]
  activeId: string | null
  activeProjectId: string | null
  onSelect: (id: string) => void
  onSelectProject: (id: string) => void
  onNew: () => void
  onNewProject: () => void
  onDelete: (id: string) => void
  onDeleteProject: (id: string) => void
}

export function ChatSidebar({
  conversations,
  projects,
  activeId,
  activeProjectId,
  onSelect,
  onSelectProject,
  onNew,
  onNewProject,
  onDelete,
  onDeleteProject,
}: ChatSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold tracking-tight">Jet<span style={{ color: "hsl(var(--accent-color))" }}>LLM</span></h1>
          <div className="flex items-center -space-x-1">
            <Button variant="ghost" size="icon" onClick={onNewProject} title="New project">
              <FolderPlus className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onNew} title="New chat">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="flex-1">
          {/* Projects section */}
          <SidebarGroup>
            <SidebarGroupLabel>
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Projects</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {projects.map(project => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      isActive={project.id === activeProjectId}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <span className="text-base leading-none shrink-0">{project.icon || "📁"}</span>
                      <span className="truncate">{project.name}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteProject(project.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
                {projects.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground/60">
                    No projects yet
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Chats section */}
          <SidebarGroup>
            <SidebarGroupLabel>
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Chats</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {conversations.map(conv => (
                  <SidebarMenuItem key={conv.id}>
                    <SidebarMenuButton
                      isActive={conv.id === activeId}
                      onClick={() => onSelect(conv.id)}
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span className="truncate">{conv.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(conv.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
                {conversations.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground/60">
                    No conversations yet
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button variant="outline" className="w-full justify-start gap-2" asChild>
          <a href="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </a>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
