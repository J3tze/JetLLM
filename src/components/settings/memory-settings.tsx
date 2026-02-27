"use client"

import { useState, useEffect, useMemo } from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"
import { toast } from "sonner"
import { Brain, ChevronsUpDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const FETCHABLE_PROVIDERS = new Set(["openrouter"])

type MemoryModelConfig = {
  provider: string
  model: string
}

export function MemorySettings() {
  const [enabled, setEnabled] = useState(true)
  const [modelConfig, setModelConfig] = useState<MemoryModelConfig>({ provider: "", model: "" })
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({})
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => {
    // Load memory settings
    fetch("/api/settings")
      .then(res => res.json())
      .then((settings: Record<string, unknown>) => {
        if (settings["memory:enabled"] !== undefined) {
          setEnabled(settings["memory:enabled"] as boolean)
        }
        if (settings["memory:model"]) {
          setModelConfig(settings["memory:model"] as MemoryModelConfig)
        }
      })
      .catch(() => {})

    // Load configured providers from the providers/configs endpoint
    fetch("/api/providers/configs")
      .then(res => res.ok ? res.json() : {})
      .then((configs: Record<string, { hasKey: boolean }>) => {
        const configured: string[] = []
        for (const p of PROVIDER_REGISTRY) {
          if (configs[p.id]?.hasKey) {
            configured.push(p.id)
          }
        }
        setConfiguredProviders(configured)
      })
      .catch(() => {})
  }, [])

  // Fetch models for providers that support it (e.g., OpenRouter)
  useEffect(() => {
    if (!FETCHABLE_PROVIDERS.has(modelConfig.provider)) return
    if (fetchedModels[modelConfig.provider]) return

    setLoadingModels(true)
    fetch(`/api/providers/models?provider=${modelConfig.provider}`)
      .then(res => res.json())
      .then((data: { models: string[] }) => {
        setFetchedModels(prev => ({ ...prev, [modelConfig.provider]: data.models }))
      })
      .catch(() => {
        setFetchedModels(prev => ({ ...prev, [modelConfig.provider]: [] }))
      })
      .finally(() => setLoadingModels(false))
  }, [modelConfig.provider, fetchedModels])

  const providerDef = PROVIDER_REGISTRY.find(p => p.id === modelConfig.provider)
  const staticModels = providerDef?.defaultModels ?? []

  const models = useMemo(() => {
    return staticModels.length > 0
      ? staticModels
      : (fetchedModels[modelConfig.provider] ?? [])
  }, [staticModels, fetchedModels, modelConfig.provider])

  const showSearchable = models.length > 10

  const save = async () => {
    setSaving(true)
    try {
      await Promise.all([
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "memory:enabled", value: enabled }),
        }),
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "memory:model", value: modelConfig }),
        }),
      ])
      toast.success("Memory settings saved")
    } catch {
      toast.error("Failed to save memory settings")
    } finally {
      setSaving(false)
    }
  }

  const handleProviderChange = (v: string) => {
    const prov = PROVIDER_REGISTRY.find(p => p.id === v)
    setModelConfig({
      provider: v,
      model: prov?.defaultModels[0] || "",
    })
  }

  const handleModelChange = (v: string) => {
    setModelConfig(prev => ({ ...prev, model: v }))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Automatic Memory
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="memory-enabled">Enable automatic memory extraction</Label>
          <Switch
            id="memory-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <Select value={modelConfig.provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a provider..." />
                </SelectTrigger>
                <SelectContent>
                  {configuredProviders.map(id => {
                    const p = PROVIDER_REGISTRY.find(r => r.id === id)
                    return p ? (
                      <SelectItem key={id} value={id}>{p.name}</SelectItem>
                    ) : null
                  })}
                </SelectContent>
              </Select>
              {configuredProviders.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Configure at least one provider with an API key first.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              {loadingModels ? (
                <div className="h-9 flex items-center px-3 text-sm text-muted-foreground bg-card rounded-md border border-input">
                  Loading models...
                </div>
              ) : showSearchable ? (
                <Popover open={modelOpen} onOpenChange={setModelOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={modelOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {modelConfig.model || "Select model..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search models..." />
                      <CommandList>
                        <CommandEmpty>No model found.</CommandEmpty>
                        {models.map(m => (
                          <CommandItem
                            key={m}
                            value={m}
                            onSelect={(value) => {
                              handleModelChange(value)
                              setModelOpen(false)
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", modelConfig.model === m ? "opacity-100" : "opacity-0")} />
                            {m}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : models.length > 0 ? (
                <Select value={modelConfig.model} onValueChange={handleModelChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={modelConfig.model}
                  onChange={(e) => handleModelChange(e.target.value)}
                  placeholder="e.g., gpt-4o-mini"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Use a fast, cheap model (e.g., GPT-4o-mini, Haiku, Gemini Flash) to keep costs low.
              </p>
            </div>
          </>
        )}

        <Button onClick={save} disabled={saving} className="w-full" size="sm">
          {saving ? "Saving..." : "Save Memory Settings"}
        </Button>
      </CardContent>
    </Card>
  )
}
