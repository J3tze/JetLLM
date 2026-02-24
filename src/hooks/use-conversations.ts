"use client"

import { useState, useEffect, useCallback } from "react"

export type Conversation = {
  id: string
  title: string
  model: string
  provider: string
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations")
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
    fetchConversations()
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
    const conv: Conversation = await res.json()
    setConversations(prev => [conv, ...prev])
    return conv
  }, [])

  const deleteConversation = useCallback(async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" })
    setConversations(prev => prev.filter(c => c.id !== id))
  }, [])

  return {
    conversations,
    loading,
    createConversation,
    deleteConversation,
    refresh: fetchConversations,
  }
}
