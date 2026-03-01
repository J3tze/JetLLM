"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { MessageSquare } from "lucide-react"

export function ChatSettings() {
  const [userName, setUserName] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then(res => res.json())
      .then((settings: Record<string, unknown>) => {
        if (typeof settings["chat:userName"] === "string") {
          setUserName(settings["chat:userName"] as string)
        }
        if (typeof settings["chat:systemPrompt"] === "string") {
          setSystemPrompt(settings["chat:systemPrompt"] as string)
        }
      })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await Promise.all([
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "chat:userName", value: userName }),
        }),
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "chat:systemPrompt", value: systemPrompt }),
        }),
      ])
      toast.success("Chat settings saved")
    } catch {
      toast.error("Failed to save chat settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="user-name">Your Name</Label>
          <Input
            id="user-name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="e.g., Jetze"
          />
          <p className="text-xs text-muted-foreground">
            The LLM will know your name and can address you personally.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="system-prompt">System Prompt</Label>
          <Textarea
            id="system-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful AI assistant."
            rows={4}
            className="resize-y min-h-[80px]"
          />
          <p className="text-xs text-muted-foreground">
            Custom instructions for the LLM. Leave empty for the default.
          </p>
        </div>

        <Button onClick={save} disabled={saving} className="w-full" size="sm">
          {saving ? "Saving..." : "Save Chat Settings"}
        </Button>
      </CardContent>
    </Card>
  )
}
