"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"
import { toast } from "sonner"
import { Eye, EyeOff } from "lucide-react"

type ProviderConfig = {
  apiKey: string
  baseUrl?: string
}

export function ProviderSettings() {
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>(() => {
    const initial: Record<string, ProviderConfig> = {}
    for (const p of PROVIDER_REGISTRY) {
      initial[p.id] = { apiKey: "" }
    }
    return initial
  })
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then((settings: Record<string, unknown>) => {
        setConfigs(prev => {
          const next = { ...prev }
          for (const p of PROVIDER_REGISTRY) {
            const key = `provider:${p.id}`
            if (settings[key] && typeof settings[key] === "object") {
              next[p.id] = settings[key] as ProviderConfig
            }
          }
          return next
        })
      })
  }, [])

  const updateConfig = (providerId: string, field: keyof ProviderConfig, value: string) => {
    setConfigs(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], [field]: value },
    }))
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      const promises = Object.entries(configs)
        .filter(([, config]) => config.apiKey)
        .map(([providerId, config]) =>
          fetch("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: `provider:${providerId}`, value: config }),
          })
        )
      await Promise.all(promises)
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {PROVIDER_REGISTRY.map(p => {
        const hasKey = !!configs[p.id]?.apiKey
        return (
          <Card key={p.id} className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {hasKey && (
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                )}
                {p.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">API Key</Label>
                <div className="relative">
                  <Input
                    type={showKeys[p.id] ? "text" : "password"}
                    value={configs[p.id]?.apiKey ?? ""}
                    onChange={e => updateConfig(p.id, "apiKey", e.target.value)}
                    placeholder={`Enter ${p.name} API key`}
                    className="pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                  >
                    {showKeys[p.id]
                      ? <EyeOff className="h-3.5 w-3.5" />
                      : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              {p.supportsCustomBase && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Base URL <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    value={configs[p.id]?.baseUrl ?? ""}
                    onChange={e => updateConfig(p.id, "baseUrl", e.target.value)}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      <div className="sticky bottom-0 py-4 bg-background">
        <Button className="w-full" onClick={saveAll} disabled={saving}>
          {saving ? "Saving..." : "Save All Settings"}
        </Button>
      </div>
    </div>
  )
}
