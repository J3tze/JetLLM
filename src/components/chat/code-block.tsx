"use client"

import { useState, useEffect, useRef } from "react"
import { Check, Copy } from "lucide-react"

const SHIKI_THEME = "github-dark-default"

const LANGUAGE_ALIASES: Record<string, string> = {
  csharp: "csharp",
  "c#": "csharp",
  "c++": "cpp",
  js: "javascript",
  ts: "typescript",
  md: "markdown",
  plain: "plaintext",
  text: "plaintext",
  txt: "plaintext",
  py: "python",
  yml: "yaml",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
}

type MinimalHighlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string
}

let highlighterPromise: Promise<MinimalHighlighter> | null = null

function normalizeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase()
  if (!normalized) return "plaintext"
  return LANGUAGE_ALIASES[normalized] ?? normalized
}

async function getHighlighter(): Promise<MinimalHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: [SHIKI_THEME],
        langs: [
          "plaintext",
          "bash",
          "powershell",
          "javascript",
          "typescript",
          "jsx",
          "tsx",
          "json",
          "html",
          "css",
          "scss",
          "markdown",
          "yaml",
          "sql",
          "python",
          "go",
          "rust",
          "java",
          "c",
          "cpp",
          "csharp",
          "php",
          "ruby",
        ],
      })
    )
  }

  return highlighterPromise
}

function withBlackCodeBackground(html: string): string {
  return html.replace(/background(?:-color)?:\s*[^;"']+/g, "background-color: rgba(0, 0, 0, 0.35)")
}

type CodeBlockProps = {
  language: string
  code: string
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [highlighted, setHighlighted] = useState<{ key: string; html: string } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const requestIdRef = useRef(0)
  const languageLabel = language || "text"
  const contentKey = `${language}\u0000${code}`

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    requestIdRef.current += 1
    const requestId = requestIdRef.current

    const renderHighlight = async () => {
      try {
        const highlighter = await getHighlighter()
        if (cancelled || requestId !== requestIdRef.current) return

        const preferredLanguage = normalizeLanguage(language)
        let html: string

        try {
          html = highlighter.codeToHtml(code, {
            lang: preferredLanguage,
            theme: SHIKI_THEME,
          })
        } catch {
          html = highlighter.codeToHtml(code, {
            lang: "plaintext",
            theme: SHIKI_THEME,
          })
        }

        html = withBlackCodeBackground(html)

        if (cancelled || requestId !== requestIdRef.current) return
        setHighlighted({ key: contentKey, html })
      } catch {
        if (cancelled || requestId !== requestIdRef.current) return
        setHighlighted(null)
      }
    }

    void renderHighlight()

    return () => {
      cancelled = true
    }
  }, [code, contentKey, language])

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
        <span className="text-xs text-muted-foreground font-mono">{languageLabel}</span>
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
        {highlighted?.key === contentKey ? (
          <div
            className="[&_.shiki]:!m-0 [&_.shiki]:!bg-transparent [&_.shiki]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlighted.html }}
          />
        ) : (
          <pre className="!bg-transparent !m-0 !p-0">
            <code className="leading-relaxed">{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
