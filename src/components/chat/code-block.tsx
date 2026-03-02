"use client"

import { useState, useEffect, useRef } from "react"
import { Check, Copy } from "lucide-react"

type CodeBlockProps = {
  language: string
  code: string
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="my-3 rounded-xl border border-white/[0.08] overflow-hidden" style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}>
      {/* Header: language label + copy button */}
      <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}>
        <span className="text-xs text-muted-foreground font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <div className="overflow-x-auto p-4" style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.85em" }}>
        <pre className="!bg-transparent !m-0 !p-0">
          <code className="leading-relaxed">{code}</code>
        </pre>
      </div>
    </div>
  )
}
