"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { EmojiPicker } from "./emoji-picker"
import type { Project } from "@/hooks/use-projects"

type ProjectSettingsProps = {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { name: string; icon: string; systemPrompt: string | null }) => void
}

export function ProjectSettings({ project, open, onOpenChange, onSave }: ProjectSettingsProps) {
  const [name, setName] = useState(project.name)
  const [icon, setIcon] = useState(project.icon || "\u{1F4C1}")
  const [systemPrompt, setSystemPrompt] = useState(project.systemPrompt || "")

  const resetForm = () => {
    setName(project.name)
    setIcon(project.icon || "\u{1F4C1}")
    setSystemPrompt(project.systemPrompt || "")
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  const handleSave = () => {
    onSave({
      name: name.trim() || "New Project",
      icon,
      systemPrompt: systemPrompt.trim() || null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>
            Configure the name, icon, and system prompt for this project.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <div className="flex items-center gap-2">
              <EmojiPicker value={icon} onSelect={setIcon}>
                <button className="flex items-center justify-center h-9 w-9 rounded-md border border-border/50 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-lg shrink-0">
                  {icon}
                </button>
              </EmojiPicker>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-prompt">System Prompt</Label>
            <Textarea
              id="project-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Instructions for all conversations in this project..."
              rows={5}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
