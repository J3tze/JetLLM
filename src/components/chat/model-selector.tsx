"use client"

import { useState, useEffect, useMemo, useRef } from "react"
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
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({})
  const fetchedRef = useRef<Record<string, boolean>>({})
  const activeRequestRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!FETCHABLE_PROVIDERS.has(provider)) {
      setLoading(false)
      return
    }
    if (fetchedRef.current[provider]) {
      setLoading(false)
      return
    }

    const requestId = activeRequestRef.current + 1
    activeRequestRef.current = requestId
    const controller = new AbortController()

    async function loadModels() {
      setLoading(true)
      try {
        const res = await fetch(`/api/providers/models?provider=${provider}`, { signal: controller.signal })
        if (!res.ok) throw new Error("Failed to load provider models")

        const data: { models: string[] } = await res.json()
        if (controller.signal.aborted) return

        setFetchedModels(prev => ({ ...prev, [provider]: data.models }))
        fetchedRef.current[provider] = true
      } catch {
        if (!controller.signal.aborted) {
          setFetchedModels(prev => ({ ...prev, [provider]: [] }))
        }
      } finally {
        if (activeRequestRef.current === requestId) {
          setLoading(false)
        }
      }
    }

    void loadModels()

    return () => {
      controller.abort()
    }
  }, [provider])

  const models = useMemo(() => {
    const staticModels = PROVIDER_REGISTRY.find(p => p.id === provider)?.defaultModels ?? []
    return staticModels.length > 0 ? staticModels : (fetchedModels[provider] ?? [])
  }, [fetchedModels, provider])

  const showSearchable = models.length > 10

  return (
    <div className="flex gap-2 flex-1 sm:flex-initial min-w-0">
      <Select value={provider} onValueChange={onProviderChange}>
        <SelectTrigger className="min-w-[140px] h-9 shrink-0 text-xs !border-border !bg-transparent">
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
        <div className="min-w-[200px] flex-1 sm:flex-initial h-9 flex items-center px-3 text-xs text-muted-foreground rounded-md border border-border bg-transparent">
          Loading models...
        </div>
      ) : showSearchable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-w-[200px] flex-1 sm:flex-initial h-9 justify-between text-xs font-normal !bg-transparent !border-border"
            >
              <span className="truncate">
                {model || "Select model..."}
              </span>
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 border-border" align="start">
            <Command className="bg-transparent">
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
          <SelectTrigger className="min-w-[200px] flex-1 sm:flex-initial h-9 text-xs !border-border !bg-transparent">
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
          className="min-w-[200px] flex-1 sm:flex-initial h-9 text-xs border-border bg-transparent"
        />
      )}
    </div>
  )
}
