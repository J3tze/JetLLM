import { embed, embedMany } from "ai"
import { getEmbeddingModel } from "@/lib/providers"
import { getSetting } from "@/lib/settings"

type EmbeddingModelConfig = { provider: string; model: string }

function getConfiguredModel() {
  const config = getSetting<EmbeddingModelConfig>("rag:model")
  if (!config?.provider || !config?.model) {
    throw new Error("No embedding model configured. Set rag:model in settings.")
  }
  return getEmbeddingModel(config.provider, config.model)
}

export async function embedSingle(text: string): Promise<number[]> {
  const model = getConfiguredModel()
  const { embedding } = await embed({ model, value: text })
  return embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = getConfiguredModel()
  const { embeddings } = await embedMany({ model, values: texts })
  return embeddings
}
