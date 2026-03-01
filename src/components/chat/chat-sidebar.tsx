"use client"

import { useState } from "react"
import { Plus, Trash2, MessageSquare, Settings, FolderPlus, MoreHorizontal, Pin, PinOff, Pencil } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
  SidebarRail,
  useSidebar,
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
  onPinProject: (id: string, currentPin: boolean) => void
  onPinConversation: (id: string, currentPin: boolean) => void
  onRenameProject: (id: string, name: string) => Promise<void> | void
  onRenameConversation: (id: string, title: string) => Promise<void> | void
}

type DeleteTarget = { type: "chat" | "project"; id: string; name: string } | null
type RenameTarget = { type: "chat" | "project"; id: string; name: string } | null

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
  onPinProject,
  onPinConversation,
  onRenameProject,
  onRenameConversation,
}: ChatSidebarProps) {
  const { setOpenMobile } = useSidebar()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null)
  const [renameValue, setRenameValue] = useState("")

  const closeMobile = () => setOpenMobile(false)

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === "chat") {
      onDelete(deleteTarget.id)
    } else {
      onDeleteProject(deleteTarget.id)
    }
    setDeleteTarget(null)
  }

  const openRenameDialog = (target: Exclude<RenameTarget, null>) => {
    setRenameTarget(target)
    setRenameValue(target.name)
  }

  const closeRenameDialog = () => {
    setRenameTarget(null)
    setRenameValue("")
  }

  const handleConfirmRename = async () => {
    if (!renameTarget) return

    const trimmed = renameValue.trim()
    const nextName = trimmed || (renameTarget.type === "project" ? "New Project" : "New Chat")

    try {
      if (nextName !== renameTarget.name) {
        if (renameTarget.type === "project") {
          await onRenameProject(renameTarget.id, nextName)
        } else {
          await onRenameConversation(renameTarget.id, nextName)
        }
      }
      closeRenameDialog()
    } catch (error) {
      console.error("[chat-sidebar] Rename failed:", error)
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold tracking-tight">Jet<span style={{ color: "hsl(var(--accent-color))" }}>LLM</span></h1>
          <div className="flex items-center -space-x-1">
            <Button variant="ghost" size="icon" onClick={() => { onNewProject(); closeMobile() }} title="New project">
              <FolderPlus className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { onNew(); closeMobile() }} title="New chat">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="scrollbar-none">
        <div className="flex-1">
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
                      onClick={() => { onSelectProject(project.id); closeMobile() }}
                    >
                      <span className="text-base leading-none shrink-0">{project.icon || "\u{1F4C1}"}</span>
                      <span className="truncate flex-1 min-w-0 pr-1">{project.name}</span>
                      {project.isPinned && <Pin className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />}
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal className="h-4 w-4" />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem onClick={() => onPinProject(project.id, project.isPinned)}>
                          {project.isPinned ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2" />}
                          {project.isPinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRenameDialog({ type: "project", id: project.id, name: project.name })}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget({ type: "project", id: project.id, name: project.name })}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                      onClick={() => { onSelect(conv.id); closeMobile() }}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1 min-w-0 pr-1">{conv.title}</span>
                      {conv.isPinned && <Pin className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />}
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal className="h-4 w-4" />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem onClick={() => onPinConversation(conv.id, conv.isPinned)}>
                          {conv.isPinned ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2" />}
                          {conv.isPinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRenameDialog({ type: "chat", id: conv.id, name: conv.title })}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget({ type: "chat", id: conv.id, name: conv.title })}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
        </div>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button variant="outline" className="w-full justify-start gap-2" asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </Button>
      </SidebarFooter>

      <SidebarRail />

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) closeRenameDialog() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Rename {renameTarget?.type === "project" ? "project" : "chat"}
            </DialogTitle>
            <DialogDescription>
              Enter a new name for &ldquo;{renameTarget?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleConfirmRename()
            }}
          >
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder={renameTarget?.type === "project" ? "Project name" : "Chat name"}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeRenameDialog}>
                Cancel
              </Button>
              <Button type="submit">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === "project" ? "project" : "chat"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;?
              {deleteTarget?.type === "project" && " All conversations in this project will be unlinked."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  )
}
