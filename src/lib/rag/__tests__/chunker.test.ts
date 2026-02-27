import { describe, it, expect } from "vitest"
import { chunkText } from "@/lib/rag/chunker"

describe("chunkText", () => {
  it("returns single chunk for short text", () => {
    const text = "Hello, world! This is a short piece of text."
    const chunks = chunkText(text)
    expect(chunks).toEqual([text])
  })

  it("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([])
    expect(chunkText("   ")).toEqual([])
    expect(chunkText("\n\n")).toEqual([])
  })

  it("splits on double newlines when exceeding maxChars", () => {
    const para1 = "A".repeat(80)
    const para2 = "B".repeat(80)
    const para3 = "C".repeat(80)
    const text = [para1, para2, para3].join("\n\n")

    const chunks = chunkText(text, { maxChars: 170, overlap: 0 })

    // para1 + "\n\n" + para2 = 80+2+80 = 162 <= 170, fits in one chunk
    // adding para3 would be 162+2+80 = 244 > 170, so para3 goes in a second chunk
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toContain("A".repeat(80))
    expect(chunks[0]).toContain("B".repeat(80))
    expect(chunks[1]).toBe("C".repeat(80))
  })

  it("respects maxChars limit (no raw chunk exceeds maxChars)", () => {
    // Build text that will create multiple chunks
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Paragraph ${i}: ${"x".repeat(150)}`
    )
    const text = paragraphs.join("\n\n")

    const maxChars = 400
    const overlap = 50
    const chunks = chunkText(text, { maxChars, overlap })

    expect(chunks.length).toBeGreaterThan(1)

    // The first chunk has no overlap prefix, so it should be <= maxChars
    expect(chunks[0].length).toBeLessThanOrEqual(maxChars)

    // Subsequent chunks include overlap prefix, which can push them
    // up to maxChars + overlap + 2 (for the \n\n separator)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].length).toBeLessThanOrEqual(maxChars + overlap + 2)
    }
  })

  it("adds overlap between consecutive chunks", () => {
    const para1 = "First paragraph content here."
    const para2 = "Second paragraph content here."
    const text = para1 + "\n\n" + para2

    const chunks = chunkText(text, { maxChars: 35, overlap: 10 })

    expect(chunks.length).toBe(2)
    // First chunk should be just para1
    expect(chunks[0]).toBe(para1)
    // Second chunk should start with the tail of the first chunk
    const tail = para1.slice(-10)
    expect(chunks[1]).toContain(tail)
    expect(chunks[1]).toContain(para2)
  })

  it("handles single very long paragraph (splits on sentences)", () => {
    // Create a long paragraph with multiple sentences
    const sentences = [
      "The quick brown fox jumps over the lazy dog.",
      "A stitch in time saves nine.",
      "All that glitters is not gold.",
      "Actions speak louder than words.",
      "The pen is mightier than the sword.",
    ]
    const longParagraph = sentences.join(" ")

    const chunks = chunkText(longParagraph, { maxChars: 80, overlap: 0 })

    expect(chunks.length).toBeGreaterThan(1)
    // Each chunk should be within limits
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80)
    }
    // Joined chunks should reconstruct the original content (minus whitespace diffs)
    const reconstructed = chunks.join("\n\n")
    for (const sentence of sentences) {
      expect(reconstructed).toContain(sentence.trim())
    }
  })

  it("handles text with no paragraph breaks", () => {
    // Single block of text that exceeds maxChars, no double newlines
    const text = "Word ".repeat(100).trim() // ~499 chars
    const chunks = chunkText(text, { maxChars: 120, overlap: 0 })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(120)
    }
  })

  it("handles text with only single newlines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i}: ${"y".repeat(40)}`)
    const text = lines.join("\n")

    const chunks = chunkText(text, { maxChars: 100, overlap: 0 })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100)
    }
  })

  it("uses default options when none provided", () => {
    // Text under 2000 chars should be a single chunk
    const text = "Hello ".repeat(100) // 600 chars
    const chunks = chunkText(text)
    expect(chunks).toEqual([text.trim()])
  })
})
