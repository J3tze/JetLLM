"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type CommandContextValue = {
  query: string
  setQuery: (next: string) => void
  visibleItemCount: number
  setItemVisibility: (id: string, visible: boolean) => void
  removeItem: (id: string) => void
}

const CommandContext = React.createContext<CommandContextValue | null>(null)

function useCommandContext(componentName: string): CommandContextValue {
  const ctx = React.useContext(CommandContext)
  if (!ctx) {
    throw new Error(`${componentName} must be used within <Command>.`)
  }
  return ctx
}

function flattenNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(flattenNodeText).join(" ")
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return flattenNodeText(node.props.children)
  }

  return ""
}

function Command({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const [query, setQuery] = React.useState("")
  const [itemVisibility, setItemVisibilityMap] = React.useState<Record<string, boolean>>({})

  const setItemVisibility = React.useCallback((id: string, visible: boolean) => {
    setItemVisibilityMap((prev) => {
      if (prev[id] === visible) return prev
      return { ...prev, [id]: visible }
    })
  }, [])

  const removeItem = React.useCallback((id: string) => {
    setItemVisibilityMap((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const visibleItemCount = React.useMemo(
    () => Object.values(itemVisibility).filter(Boolean).length,
    [itemVisibility]
  )

  const contextValue = React.useMemo<CommandContextValue>(() => ({
    query,
    setQuery,
    visibleItemCount,
    setItemVisibility,
    removeItem,
  }), [query, visibleItemCount, setItemVisibility, removeItem])

  return (
    <CommandContext.Provider value={contextValue}>
      <div
        data-slot="command"
        className={cn(
          "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </CommandContext.Provider>
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command className="**:data-[slot=command-input-wrapper]:h-12 [&_[data-slot=command-item]]:px-2 [&_[data-slot=command-item]]:py-3 [&_[data-slot=command-item]_svg]:h-5 [&_[data-slot=command-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  value,
  onChange,
  ...props
}: React.ComponentProps<"input">) {
  const { query, setQuery } = useCommandContext("CommandInput")

  const resolvedValue = typeof value === "string" ? value : query

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (value === undefined) {
      setQuery(event.target.value)
    }
    onChange?.(event)
  }

  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        value={resolvedValue}
        onChange={handleChange}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { visibleItemCount } = useCommandContext("CommandEmpty")

  if (visibleItemCount > 0) {
    return null
  }

  return (
    <div
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-group"
      className={cn("text-foreground overflow-hidden p-1", className)}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  )
}

type CommandItemProps = Omit<React.ComponentProps<"div">, "onSelect"> & {
  value?: string
  onSelect?: (value: string) => void
}

function CommandItem({
  className,
  value,
  onSelect,
  children,
  onClick,
  onKeyDown,
  ...props
}: CommandItemProps) {
  const { query, setItemVisibility, removeItem } = useCommandContext("CommandItem")
  const itemId = React.useId()

  const itemValue = React.useMemo(() => {
    return (value ?? flattenNodeText(children)).trim()
  }, [value, children])

  const isVisible = React.useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return true
    return itemValue.toLowerCase().includes(search)
  }, [query, itemValue])

  React.useEffect(() => {
    setItemVisibility(itemId, isVisible)
    return () => removeItem(itemId)
  }, [itemId, isVisible, setItemVisibility, removeItem])

  if (!isVisible) {
    return null
  }

  const disabled = props["aria-disabled"] === true || props["aria-disabled"] === "true"

  const activate = () => {
    if (disabled) return
    onSelect?.(itemValue)
  }

  return (
    <div
      data-slot="command-item"
      data-disabled={disabled ? "true" : undefined}
      tabIndex={disabled ? -1 : 0}
      role="option"
      aria-selected={false}
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          activate()
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          activate()
        }
      }}
      {...props}
    >
      {children}
    </div>
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
