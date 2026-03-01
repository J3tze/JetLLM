"use client"

import { useState, useEffect, useCallback } from "react"

export type Conversation = {
  id: string
  title: string
  model: string
  provider: string
  systemPrompt: string | null
  projectId: string | null
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const sortConversations = useCallback((items: Conversation[]) => {
    return [...items].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [])

  const fetchConversations = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store", signal })
      if (!res.ok) return
      const data = await res.json()
      setConversations(data)
    } catch {
      // DB may not be initialized yet
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchConversations(controller.signal)
    return () => controller.abort()
  }, [fetchConversations])

  const createConversation = useCallback(async (data: {
    model: string
    provider: string
    title?: string
  }): Promise<Conversation> => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      throw new Error("Failed to create conversation")
    }
    const conv: Conversation = await res.json()
    setConversations(prev => sortConversations([conv, ...prev]))
    return conv
  }, [sortConversations])

  const deleteConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" })
    if (!res.ok) {
      throw new Error("Failed to delete conversation")
    }
    setConversations(prev => prev.filter(c => c.id !== id))
  }, [])

  const renameConversation = useCallback(async (id: string, title: string) => {
    const nextTitle = title.trim() || "New Chat"
    const optimisticUpdatedAt = new Date().toISOString()
    let previous: Conversation[] = []

    setConversations(prev => {
      previous = prev
      const updated = prev.map(c =>
        c.id === id
          ? { ...c, title: nextTitle, updatedAt: optimisticUpdatedAt }
          : c
      )
      return sortConversations(updated)
    })

    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      })
      if (!res.ok) {
        throw new Error("Failed to rename conversation")
      }
      const updated: Conversation = await res.json()
      setConversations(prev =>
        sortConversations(prev.map(c => (c.id === id ? updated : c)))
      )
    } catch {
      setConversations(previous)
      throw new Error("Failed to rename conversation")
    }
  }, [sortConversations])

  const togglePin = useCallback(async (id: string, currentPin: boolean) => {
    const optimisticUpdatedAt = new Date().toISOString()
    let previous: Conversation[] = []

    // Optimistic update
    setConversations(prev => {
      previous = prev
      const updated = prev.map(c =>
        c.id === id
          ? { ...c, isPinned: !currentPin, updatedAt: optimisticUpdatedAt }
          : c
      )
      return sortConversations(updated)
    })

    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !currentPin }),
      })
      if (!res.ok) {
        throw new Error("Failed to update pin state")
      }
      const updated: Conversation = await res.json()
      setConversations(prev =>
        sortConversations(prev.map(c => (c.id === id ? updated : c)))
      )
    } catch {
      setConversations(previous)
      throw new Error("Failed to update pin state")
    }
  }, [sortConversations])

  return {
    conversations,
    loading,
    createConversation,
    deleteConversation,
    renameConversation,
    togglePin,
    refresh: fetchConversations,
  }
}
