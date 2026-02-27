"use client"

import { useState, useEffect, useRef } from "react"
import { Check, Copy } from "lucide-react"

// Lazy-load Shiki highlighter — created once, reused across all renders
let highlighterPromise: Promise<import("shiki").Highlighter> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["github-dark-default"],
        langs: [],
      })
    )
  }
  return highlighterPromise
}

type CodeBlockProps = {
  language: string
  code: string
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [html, setHtml] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let cancelled = false

    getHighlighter()
      .then(async (highlighter) => {
        if (cancelled) return

        // Load the language grammar if not already loaded
        const loadedLangs = highlighter.getLoadedLanguages()
        if (!loadedLangs.includes(language as never)) {
          try {
            await highlighter.loadLanguage(language as never)
          } catch {
            // Language not supported — fall back to plaintext
            if (!loadedLangs.includes("plaintext" as never)) {
              await highlighter.loadLanguage("plaintext" as never)
            }
          }
        }

        if (cancelled) return

        const highlighted = highlighter.codeToHtml(code, {
          lang: highlighter.getLoadedLanguages().includes(language as never) ? language : "plaintext",
          theme: "github-dark-default",
        })
        setHtml(highlighted)
      })
      .catch(() => {
        // Shiki failed to load entirely — leave html empty, fallback renders
      })

    return () => { cancelled = true }
  }, [code, language])

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="not-prose my-3 rounded-xl border border-white/[0.08] overflow-hidden" style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}>
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
        {html ? (
          <div
            dangerouslySetInnerHTML={{ __html: html }}
            className="[&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent leading-relaxed"
          />
        ) : (
          // Fallback: plain monospace while Shiki loads
          <pre className="!bg-transparent !m-0 !p-0">
            <code className="leading-relaxed">{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
