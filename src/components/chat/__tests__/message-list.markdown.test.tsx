/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import type { UIMessage } from "ai"
import { MessageList } from "../message-list"

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="mock-image" data-alt={alt} />,
}))

vi.mock("../chat-message", () => ({
  ChatMessage: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock("../code-block", () => ({
  CodeBlock: ({ language, code }: { language: string; code: string }) => (
    <div data-testid="code-block" data-language={language}>
      {code}
    </div>
  ),
}))

vi.mock("lucide-react", () => ({
  ChevronDown: () => null,
  Globe: () => null,
  RotateCw: () => null,
  FileText: () => null,
}))

vi.mock("@/components/jetllm-logo", () => ({
  JetLLMLogo: () => <div>JetLLM</div>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentPropsWithoutRef<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock("@/lib/utils", () => ({
  cn: (...parts: Array<string | undefined | null | false>) => parts.filter(Boolean).join(" "),
}))

function assistantMessage(text: string): UIMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text }],
  } as unknown as UIMessage
}

describe("MessageList markdown rendering", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders headings, lists, and secure links from markdown", () => {
    render(
      <MessageList
        messages={[
          assistantMessage(`#### Deep heading

- Item one
- Item two

[Docs](https://example.com)`),
        ]}
      />
    )

    expect(screen.getByRole("heading", { level: 4, name: "Deep heading" })).not.toBeNull()
    expect(screen.getByRole("list")).not.toBeNull()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)

    const link = screen.getByRole("link", { name: "Docs" })
    expect(link.getAttribute("href")).toBe("https://example.com")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toContain("noopener")
    expect(link.getAttribute("rel")).toContain("noreferrer")
  })

  it("routes fenced code blocks through CodeBlock", () => {
    render(
      <MessageList
        messages={[
          assistantMessage(`\`\`\`c++
int main() { return 0; }
\`\`\``),
        ]}
      />
    )

    const codeBlock = screen.getByTestId("code-block")
    expect(codeBlock.getAttribute("data-language")).toBe("c++")
    expect(codeBlock.textContent).toContain("int main()")
  })

  it("keeps inline code inline and does not use CodeBlock", () => {
    render(
      <MessageList
        messages={[
          assistantMessage("Run `npm test` and check results."),
        ]}
      />
    )

    expect(screen.queryByTestId("code-block")).toBeNull()
    const inlineCode = screen.getByText("npm test")
    expect(inlineCode.tagName).toBe("CODE")
  })
})
