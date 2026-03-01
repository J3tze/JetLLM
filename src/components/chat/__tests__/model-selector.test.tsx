/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { ModelSelector } from "../model-selector"

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandInput: () => null,
  CommandList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: ComponentPropsWithoutRef<"input">) => <input {...props} />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentPropsWithoutRef<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock("lucide-react", () => ({
  ChevronsUpDown: () => null,
  Check: () => null,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...parts: Array<string | undefined | null | false>) => parts.filter(Boolean).join(" "),
}))

describe("ModelSelector", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("resets loading after an aborted fetch when switching providers", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (signal) {
          signal.addEventListener("abort", () => {
            const abortError = Object.assign(new Error("Aborted"), { name: "AbortError" })
            reject(abortError)
          })
        }
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const { rerender } = render(
      <ModelSelector
        provider="openrouter"
        model=""
        onProviderChange={() => {}}
        onModelChange={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.queryByText("Loading models...")).not.toBeNull()
    })

    rerender(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={() => {}}
        onModelChange={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.queryByText("Loading models...")).toBeNull()
    })
  })

  it("retries provider model fetch after a prior request was aborted", async () => {
    let requestCount = 0
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      requestCount += 1

      if (requestCount === 1) {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (signal) {
            signal.addEventListener("abort", () => {
              const abortError = Object.assign(new Error("Aborted"), { name: "AbortError" })
              reject(abortError)
            })
          }
        })
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ models: ["openrouter/test-model"] }),
      } as Response)
    })
    vi.stubGlobal("fetch", fetchMock)

    const { rerender } = render(
      <ModelSelector
        provider="openrouter"
        model=""
        onProviderChange={() => {}}
        onModelChange={() => {}}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    rerender(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={() => {}}
        onModelChange={() => {}}
      />
    )

    rerender(
      <ModelSelector
        provider="openrouter"
        model=""
        onProviderChange={() => {}}
        onModelChange={() => {}}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
