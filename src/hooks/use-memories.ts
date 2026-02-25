"use client"

import { useState, useEffect, useCallback } from "react"

export type Memory = {
  id: string
  type: "fact" | "preference" | "summary"
  content: string
  sourceConversationId: string | null
  createdAt: string
}

export function useMemories() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/memory")
      if (!res.ok) return
      const data = await res.json()
      setMemories(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMemories()
  }, [fetchMemories])

  const addMemory = useCallback(async (data: { type: string; content: string }) => {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const memory: Memory = await res.json()
    setMemories(prev => [memory, ...prev])
    return memory
  }, [])

  const updateMemory = useCallback(async (id: string, data: { content?: string; type?: string }) => {
    const res = await fetch(`/api/memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const updated: Memory = await res.json()
    setMemories(prev => prev.map(m => m.id === id ? updated : m))
  }, [])

  const deleteMemory = useCallback(async (id: string) => {
    await fetch(`/api/memory/${id}`, { method: "DELETE" })
    setMemories(prev => prev.filter(m => m.id !== id))
  }, [])

  return { memories, loading, addMemory, updateMemory, deleteMemory, refresh: fetchMemories }
}
