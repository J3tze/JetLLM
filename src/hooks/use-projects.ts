"use client"

import { useState, useEffect, useCallback } from "react"

export type Project = {
  id: string
  name: string
  icon: string | null
  systemPrompt: string | null
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const sortProjects = useCallback((items: Project[]) => {
    return [...items].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [])

  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store", signal })
      if (!res.ok) return
      setProjects(await res.json())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchProjects(controller.signal)
    return () => controller.abort()
  }, [fetchProjects])

  const createProject = useCallback(async (data?: { name?: string; icon?: string }) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || {}),
    })
    if (!res.ok) {
      throw new Error("Failed to create project")
    }
    const project: Project = await res.json()
    setProjects(prev => sortProjects([project, ...prev]))
    return project
  }, [sortProjects])

  const deleteProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" })
    if (!res.ok) {
      throw new Error("Failed to delete project")
    }
    setProjects(prev => prev.filter(p => p.id !== id))
  }, [])

  const updateProject = useCallback(async (id: string, data: Partial<Pick<Project, "name" | "icon" | "systemPrompt" | "isPinned">>) => {
    const optimisticUpdatedAt = new Date().toISOString()
    let previous: Project[] = []

    setProjects(prev => {
      previous = prev
      const optimistic = prev.map(project =>
        project.id === id
          ? { ...project, ...data, updatedAt: optimisticUpdatedAt }
          : project
      )
      return sortProjects(optimistic)
    })

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        throw new Error("Failed to update project")
      }
      const updated: Project = await res.json()
      setProjects(prev => sortProjects(prev.map(project => (project.id === id ? updated : project))))
    } catch {
      setProjects(previous)
      throw new Error("Failed to update project")
    }
  }, [sortProjects])

  return { projects, loading, createProject, deleteProject, updateProject, refresh: fetchProjects }
}
