"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChevronsUpDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { PROVIDER_REGISTRY } from "@/lib/providers/registry"

const FETCHABLE_PROVIDERS = new Set(["openrouter"])

type ModelSelectorProps = {
  provider: string
  model: string
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
}

export function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
}: ModelSelectorProps) {
  const providerDef = PROVIDER_REGISTRY.find(p => p.id === provider)
  const staticModels = providerDef?.defaultModels ?? []

  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!FETCHABLE_PROVIDERS.has(provider)) return
    if (fetchedModels[provider]) return

    setLoading(true)
    fetch(`/api/providers/models?provider=${provider}`)
      .then(res => res.json())
      .then((data: { models: string[] }) => {
        setFetchedModels(prev => ({ ...prev, [provider]: data.models }))
      })
      .catch(() => {
        setFetchedModels(prev => ({ ...prev, [provider]: [] }))
      })
      .finally(() => setLoading(false))
  }, [provider, fetchedModels])

  const models = useMemo(() => {
    return staticModels.length > 0
      ? staticModels
      : (fetchedModels[provider] ?? [])
  }, [staticModels, fetchedModels, provider])

  const showSearchable = models.length > 10

  return (
    <div className="flex gap-2 flex-1 sm:flex-initial min-w-0">
      <Select value={provider} onValueChange={onProviderChange}>
        <SelectTrigger className="w-[120px] sm:w-[140px] h-8 shrink-0 text-xs border-border/50 bg-transparent">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          {PROVIDER_REGISTRY.map(p => (
            <SelectItem key={p.id} value={p.id} className="text-xs">
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <div className="min-w-0 flex-1 sm:w-[200px] h-8 flex items-center px-3 text-xs text-muted-foreground rounded-md border border-border/50 bg-transparent">
          Loading models...
        </div>
      ) : showSearchable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-w-0 flex-1 sm:w-[200px] h-8 justify-between text-xs font-normal bg-transparent border-border/50"
            >
              <span className="truncate">
                {model || "Select model..."}
              </span>
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 border-border/50" align="start">
            <Command>
              <CommandInput placeholder="Search models..." className="text-xs" />
              <CommandList>
                <CommandEmpty>No model found.</CommandEmpty>
                {models.map(m => (
                  <CommandItem
                    key={m}
                    value={m}
                    onSelect={(value) => {
                      onModelChange(value)
                      setOpen(false)
                    }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-1 h-3 w-3", model === m ? "opacity-100" : "opacity-0")} />
                    {m}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : models.length > 0 ? (
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="min-w-0 flex-1 sm:w-[200px] h-8 text-xs border-border/50 bg-transparent">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {models.map(m => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={model}
          onChange={e => onModelChange(e.target.value)}
          placeholder="Enter model ID..."
          className="min-w-0 flex-1 sm:w-[200px] h-8 text-xs border-border/50 bg-transparent"
        />
      )}
    </div>
  )
}
