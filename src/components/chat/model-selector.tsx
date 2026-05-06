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
    <div className="flex w-full min-w-0 flex-1 items-center gap-1.5 sm:w-auto sm:flex-initial sm:gap-2">
      <Select value={provider} onValueChange={onProviderChange}>
        <SelectTrigger className="h-9 w-[clamp(6.75rem,38vw,10rem)] min-w-0 shrink-0 rounded-full text-xs !border-border/55 !bg-black/[0.12] shadow-sm sm:w-auto sm:min-w-[140px]">
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
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-border/55 bg-black/[0.12] px-3 text-xs text-muted-foreground shadow-sm sm:min-w-[200px] sm:flex-initial">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Loading models...
        </div>
      ) : showSearchable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-9 min-w-0 flex-1 justify-between rounded-full text-xs font-normal !border-border/55 !bg-black/[0.12] shadow-sm sm:min-w-[200px] sm:flex-initial"
            >
              <span className="truncate">
                {model || "Select model..."}
              </span>
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] p-0 border-border" align="start">
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
          <SelectTrigger className="h-9 min-w-0 flex-1 rounded-full text-xs !border-border/55 !bg-black/[0.12] shadow-sm sm:min-w-[200px] sm:flex-initial">
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
          className="h-9 min-w-0 flex-1 rounded-full border-border/55 bg-black/[0.12] text-xs shadow-sm sm:min-w-[200px] sm:flex-initial"
        />
      )}
    </div>
  )
}
