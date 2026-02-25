"use client"

import { useState } from "react"
import { useMemories, type Memory } from "@/hooks/use-memories"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Trash2, Plus, Pencil, Check, X, Brain } from "lucide-react"

export function MemoryList() {
  const { memories, loading, addMemory, updateMemory, deleteMemory } = useMemories()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [newContent, setNewContent] = useState("")
  const [newType, setNewType] = useState<"fact" | "preference">("fact")
  const [showAdd, setShowAdd] = useState(false)

  const handleAdd = async () => {
    if (!newContent.trim()) return
    try {
      await addMemory({ type: newType, content: newContent.trim() })
      setNewContent("")
      setShowAdd(false)
      toast.success("Memory added")
    } catch {
      toast.error("Failed to add memory")
    }
  }

  const handleEdit = (memory: Memory) => {
    setEditingId(memory.id)
    setEditContent(memory.content)
  }

  const handleSaveEdit = async (id: string) => {
    if (!editContent.trim()) return
    try {
      await updateMemory(id, { content: editContent.trim() })
      setEditingId(null)
      toast.success("Memory updated")
    } catch {
      toast.error("Failed to update memory")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id)
      toast.success("Memory deleted")
    } catch {
      toast.error("Failed to delete memory")
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">Loading memories...</p>

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Stored Memories ({memories.length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {showAdd && (
          <div className="flex gap-2 mb-3">
            <Select value={newType} onValueChange={(v) => setNewType(v as "fact" | "preference")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fact">Fact</SelectItem>
                <SelectItem value="preference">Preference</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Enter a memory..."
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAdd}>Add</Button>
          </div>
        )}

        {memories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No memories yet. They will appear here as you chat.
          </p>
        ) : (
          memories.map(memory => (
            <div key={memory.id} className="flex items-center gap-2 py-1.5 group">
              <Badge variant="secondary" className="text-xs shrink-0">
                {memory.type}
              </Badge>
              {editingId === memory.id ? (
                <>
                  <Input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(memory.id)}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveEdit(memory.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm flex-1">{memory.content}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleEdit(memory)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => handleDelete(memory.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
