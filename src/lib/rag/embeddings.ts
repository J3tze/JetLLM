import { embed, embedMany } from "ai"
import { getEmbeddingModel } from "@/lib/providers"
import { getSetting, type ProviderConfig } from "@/lib/settings"

export type EmbeddingModelConfig = {
  provider: string
  model: string
  providerConfig?: ProviderConfig | null
}

function getConfiguredModel(config?: EmbeddingModelConfig) {
  const resolvedConfig = config ?? getSetting<EmbeddingModelConfig>("rag:model")
  if (!resolvedConfig?.provider || !resolvedConfig?.model) {
    throw new Error("No embedding model configured. Set rag:model in settings.")
  }
  return getEmbeddingModel(resolvedConfig.provider, resolvedConfig.model, {
    config: resolvedConfig.providerConfig,
  })
}

export async function embedSingle(text: string, config?: EmbeddingModelConfig): Promise<number[]> {
  const model = getConfiguredModel(config)
  const { embedding } = await embed({ model, value: text })
  return embedding
}

export async function embedBatch(texts: string[], config?: EmbeddingModelConfig): Promise<number[][]> {
  const model = getConfiguredModel(config)
  const { embeddings } = await embedMany({ model, values: texts })
  return embeddings
}
