# Code Block Syntax Highlighting Design

**Date:** 2026-02-27
**Scope:** Syntax-highlighted, copyable code blocks in chat messages.

---

## Overview

Replace the plain monospace code blocks in chat messages with syntax-highlighted code blocks featuring a header bar with language label and copy button. Uses Shiki for VS Code-quality highlighting with an AMOLED-compatible dark theme.

## Components

### CodeBlock Component (`src/components/chat/code-block.tsx`)

A client component that renders fenced code blocks with:

1. **Header bar** — Language label on the left (e.g. "python", "typescript"), copy button on the right. Subtle dark background slightly lighter than the code body.
2. **Code body** — Shiki-highlighted code with a dark theme. Horizontal scroll for long lines. No line wrapping.
3. **Copy button** — Clipboard icon, switches to checkmark with "Copied!" text for ~2 seconds after click.

### Integration with ReactMarkdown

Pass custom component overrides to `ReactMarkdown` in `message-list.tsx`:

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    pre: ({ children }) => <>{children}</>,  // unwrap the <pre> — CodeBlock handles it
    code: ({ className, children, ...props }) => {
      const match = className?.match(/language-(\w+)/)
      if (match) {
        return <CodeBlock language={match[1]} code={String(children).trimEnd()} />
      }
      // Inline code — keep default styling
      return <code className={className} {...props}>{children}</code>
    },
  }}
>
```

### Syntax Highlighting

- **Library:** Shiki (uses VS Code TextMate grammars via WebAssembly)
- **Theme:** `github-dark` or similar dark theme that blends with the AMOLED black UI
- **Loading:** Lazy — Shiki's highlighter loads on first code block render, not on page load. Grammars load per-language.
- **Caching:** Create the highlighter once and reuse across renders via a module-level promise.
- **Fallback:** While Shiki loads (or if it fails), render plain monospace text with the same styling minus highlighting.

### Streaming

During streaming, code blocks may be incomplete (partial syntax). Shiki handles this gracefully — it highlights what it can. The component re-renders on every streaming token as ReactMarkdown re-parses the growing text.

### Styling

- Code block background: `rgba(0, 0, 0, 0.3)` (matches existing `prose-pre:bg-black/30`)
- Header background: `rgba(255, 255, 255, 0.05)` — subtle separator
- Border: `1px solid rgba(255, 255, 255, 0.08)` — consistent with app borders
- Border radius: `0.75rem` (matches `rounded-xl`)
- Font: `var(--font-geist-mono)` for code content (ignores the chat font setting — code should always be monospace)
- Code text size: `0.85em` (matches current `prose-code:text-[0.85em]`)

### Inline Code

Single backtick inline code (`` `variable` ``) stays as-is — no highlighting, just the existing prose styling. Only fenced code blocks (triple backtick) get the CodeBlock treatment.
