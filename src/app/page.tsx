"use client"

import { useState, useCallback, useEffect } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatPanel } from "@/components/chat/chat-panel"
import { useConversations } from "@/hooks/use-conversations"

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const { conversations, deleteConversation, refresh } = useConversations()
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  const handleNew = useCallback(() => {
    setActiveId(null)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await deleteConversation(id)
    if (activeId === id) {
      setActiveId(null)
    }
  }, [activeId, deleteConversation])

  const handleConversationCreated = useCallback((id: string) => {
    setActiveId(id)
    refresh()
  }, [refresh])

  // Render nothing on server — prevents hydration mismatch from browser
  // extensions (e.g. Dark Reader) that modify DOM before React hydrates
  if (!mounted) return null

  return (
    <SidebarProvider>
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNew}
        onDelete={handleDelete}
      />
      <SidebarInset>
        <ChatPanel
          conversationId={activeId}
          onConversationCreated={handleConversationCreated}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
