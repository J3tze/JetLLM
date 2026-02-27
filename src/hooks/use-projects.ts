"use client"

import { useState, useEffect, useCallback } from "react"

export type Project = {
  id: string
  name: string
  icon: string | null
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects")
      if (!res.ok) return
      setProjects(await res.json())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const createProject = useCallback(async (data?: { name?: string; icon?: string }) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || {}),
    })
    const project: Project = await res.json()
    setProjects(prev => [project, ...prev])
    return project
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" })
    setProjects(prev => prev.filter(p => p.id !== id))
  }, [])

  const updateProject = useCallback(async (id: string, data: Partial<Pick<Project, "name" | "icon" | "systemPrompt">>) => {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    await fetchProjects()
  }, [fetchProjects])

  return { projects, loading, createProject, deleteProject, updateProject, refresh: fetchProjects }
}
