# Code Block Syntax Highlighting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add syntax-highlighted, copyable code blocks with language labels to chat messages.

**Architecture:** A `CodeBlock` React component using Shiki for VS Code-quality syntax highlighting, wired into `ReactMarkdown` via component overrides. Shiki's highlighter is lazily initialized and cached at module level. The component renders a header bar (language label + copy button) and highlighted code body.

**Tech Stack:** Shiki (syntax highlighting), ReactMarkdown component overrides, Clipboard API

**Design Doc:** `docs/plans/2026-02-27-code-blocks-design.md`

---

## Task 1: Install Shiki

**Files:**
- Modify: `package.json`

**Step 1: Install shiki**

Run:
```bash
npm install shiki
```

**Step 2: Verify installation**

Run:
```bash
node -e "require('shiki')" && echo "OK"
```
Expected: OK (no errors)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install shiki for syntax highlighting"
```

---

## Task 2: Create the CodeBlock Component

**Files:**
- Create: `src/components/chat/code-block.tsx`

**Step 1: Create the CodeBlock component**

Create `src/components/chat/code-block.tsx` with the following content:

```tsx
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
```

Key design decisions:
- `not-prose` class prevents Tailwind typography from styling the code block internals
- `[&_pre]:!bg-transparent` strips Shiki's default background so our custom background shows
- The highlighter is created lazily on first render and cached globally
- Languages are loaded on demand — only the languages the LLM actually outputs get loaded
- Fallback renders plain `<pre><code>` while Shiki loads (handles streaming gracefully)
- `dangerouslySetInnerHTML` is safe here because Shiki's output is generated from its own tokenizer, not user input

**Step 2: Run lint**

Run: `npx eslint src/components/chat/code-block.tsx`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/chat/code-block.tsx
git commit -m "feat: create CodeBlock component with Shiki highlighting and copy button"
```

---

## Task 3: Wire CodeBlock into ReactMarkdown

**Files:**
- Modify: `src/components/chat/message-list.tsx`

**Step 1: Import CodeBlock and add component overrides**

In `src/components/chat/message-list.tsx`, add the import at the top (after the existing imports):

```typescript
import { CodeBlock } from "./code-block"
```

**Step 2: Replace the ReactMarkdown usage with component overrides**

Find this block (around line 153-154):

```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
```

Replace it with:

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...props }) => {
      const match = className?.match(/language-(\w+)/)
      if (match) {
        return <CodeBlock language={match[1]} code={String(children).trimEnd()} />
      }
      return <code className={className} {...props}>{children}</code>
    },
  }}
>
  {part.text}
</ReactMarkdown>
```

How this works:
- `pre` override: ReactMarkdown wraps fenced code in `<pre><code>`. We unwrap the `<pre>` because `CodeBlock` renders its own container.
- `code` override: When `className` contains `language-xxx` (set by ReactMarkdown for fenced code), we render `CodeBlock`. Otherwise it's inline code — pass through with default styling.
- `String(children).trimEnd()` converts the React children to a string and removes trailing whitespace.

**Step 3: Run lint**

Run: `npx eslint src/components/chat/message-list.tsx`
Expected: No errors (or only pre-existing warnings).

**Step 4: Commit**

```bash
git add src/components/chat/message-list.tsx
git commit -m "feat: wire CodeBlock into ReactMarkdown for fenced code blocks"
```

---

## Task 4: Visual Verification

**Step 1: Start dev server**

Run: `npm run dev` (if not already running)

**Step 2: Test with a code-producing prompt**

Open http://localhost:3000, select a model with an API key configured, and send a message like:

> "Write me a Python function that calculates fibonacci numbers, and a TypeScript function that fetches data from an API"

**Step 3: Verify the following**

1. Code blocks render with syntax highlighting (colored tokens, not plain white)
2. Each code block has a header bar with the language name (e.g. "python", "typescript")
3. Each code block has a "Copy" button in the header
4. Clicking "Copy" copies the code to clipboard and shows "Copied!" with a checkmark for ~2 seconds
5. Inline code (single backtick) still renders normally without the CodeBlock treatment
6. Code blocks have horizontal scroll for long lines (no wrapping)
7. The code block styling fits the AMOLED aesthetic (dark background, subtle border)
8. During streaming, partial code blocks display correctly (may not highlight until complete)

**Step 4: Fix any visual issues**

Common things to check:
- If Shiki's background bleeds through, ensure `[&_pre]:!bg-transparent` is working
- If the code block is too wide, ensure `overflow-x-auto` is set
- If inline code gets caught by the CodeBlock, check the `language-` className matching
- If the code block looks cramped inside "full" bubble style, the `not-prose` + `my-3` margin should handle separation

**Step 5: Run tests**

Run: `npm test`
Expected: All existing tests pass (no regressions).

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: syntax-highlighted copyable code blocks in chat"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Install Shiki | `package.json` |
| 2 | Create CodeBlock component | `src/components/chat/code-block.tsx` |
| 3 | Wire into ReactMarkdown | `src/components/chat/message-list.tsx` |
| 4 | Visual verification | Manual testing |

**Total: 4 tasks**
