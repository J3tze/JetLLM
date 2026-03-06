import { beforeEach, describe, expect, it, vi } from "vitest"

const mockEmbedSingle = vi.fn()
const mockPrepare = vi.fn()
const mockAll = vi.fn()

vi.mock("../embeddings", () => ({
  embedSingle: (...args: unknown[]) => mockEmbedSingle(...args),
}))

vi.mock("@/lib/db", () => ({
  getRawDb: () => ({
    prepare: (...args: unknown[]) => mockPrepare(...args),
  }),
}))

describe("searchDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmbedSingle.mockResolvedValue([0.1, 0.2, 0.3])
    mockPrepare.mockReturnValue({
      all: (...args: unknown[]) => mockAll(...args),
    })
    mockAll.mockReturnValue([])
  })

  it("uses sqlite-vec k constraint instead of LIMIT parameter for KNN queries", async () => {
    const { searchDocuments } = await import("../search")

    await searchDocuments("project-1", "hello world", 5)

    const sql = mockPrepare.mock.calls[0]?.[0]
    expect(typeof sql).toBe("string")
    expect(sql).toContain("AND k = ?")
    expect(sql).not.toContain("LIMIT ?")
    expect(mockAll).toHaveBeenCalledWith("project-1", expect.any(Float32Array), 5)
  })

  it("passes a preloaded embedding config through to embedSingle", async () => {
    const { searchDocuments } = await import("../search")
    const embeddingConfig = {
      provider: "openai",
      model: "text-embedding-3-small",
      providerConfig: { apiKey: "sk-test" },
    }

    await searchDocuments("project-1", "hello world", 5, { embeddingConfig })

    expect(mockEmbedSingle).toHaveBeenCalledWith("hello world", embeddingConfig)
  })
})
