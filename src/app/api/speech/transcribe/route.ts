import { NextResponse } from "next/server"
import { getSetting, type ProviderConfig } from "@/lib/settings"
import { getCurrentUserFromRequest } from "@/lib/auth-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type SupportedSttProvider = "groq" | "openai" | "custom"

type SttCandidate = {
  providerId: SupportedSttProvider
  apiKey: string
  baseUrl: string
  model: string
}

const SUPPORTED_STT_PROVIDERS: SupportedSttProvider[] = ["groq", "openai", "custom"]
const DEFAULT_STT_MODELS: Record<SupportedSttProvider, string> = {
  groq: "whisper-large-v3-turbo",
  openai: "whisper-1",
  custom: "whisper-1",
}
const DEFAULT_PROVIDER_BASE_URLS: Record<Exclude<SupportedSttProvider, "custom">, string> = {
  groq: "https://api.groq.com/openai/v1",
  openai: "https://api.openai.com/v1",
}

function normalizeProviderId(value: unknown): SupportedSttProvider | null {
  if (typeof value !== "string") {
    return null
  }
  return SUPPORTED_STT_PROVIDERS.find(provider => provider === value) ?? null
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function getProviderOrder(preferredProvider: SupportedSttProvider | null): SupportedSttProvider[] {
  const configuredDefault = normalizeProviderId(getSetting<string>("speech:sttProvider"))
  const order: SupportedSttProvider[] = []

  if (preferredProvider) {
    order.push(preferredProvider)
  }
  if (configuredDefault && !order.includes(configuredDefault)) {
    order.push(configuredDefault)
  }
  for (const provider of SUPPORTED_STT_PROVIDERS) {
    if (!order.includes(provider)) {
      order.push(provider)
    }
  }

  return order
}

function getSttCandidates(preferredProvider: SupportedSttProvider | null): SttCandidate[] {
  const modelOverride = (getSetting<string>("speech:sttModel") ?? "").trim()
  const order = getProviderOrder(preferredProvider)
  const candidates: SttCandidate[] = []

  for (const providerId of order) {
    const config = getSetting<ProviderConfig>(`provider:${providerId}`)
    const apiKey = config?.apiKey?.trim() ?? ""
    if (!apiKey) {
      continue
    }

    const configuredBaseUrl = config?.baseUrl?.trim()
    const defaultBaseUrl = providerId === "custom" ? undefined : DEFAULT_PROVIDER_BASE_URLS[providerId]
    const baseUrl = normalizeBaseUrl(configuredBaseUrl || defaultBaseUrl || "")
    if (!baseUrl) {
      continue
    }

    candidates.push({
      providerId,
      apiKey,
      baseUrl,
      model: modelOverride || DEFAULT_STT_MODELS[providerId],
    })
  }

  return candidates
}

function extractProviderError(providerId: SupportedSttProvider, status: number, payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return `[${providerId}] ${payload.trim()}`
  }

  if (payload && typeof payload === "object") {
    const responsePayload = payload as {
      error?: unknown
      message?: unknown
    }

    if (typeof responsePayload.message === "string" && responsePayload.message.trim()) {
      return `[${providerId}] ${responsePayload.message}`
    }

    if (typeof responsePayload.error === "string" && responsePayload.error.trim()) {
      return `[${providerId}] ${responsePayload.error}`
    }

    if (responsePayload.error && typeof responsePayload.error === "object") {
      const nestedError = responsePayload.error as { message?: unknown }
      if (typeof nestedError.message === "string" && nestedError.message.trim()) {
        return `[${providerId}] ${nestedError.message}`
      }
    }
  }

  return `[${providerId}] Transcription failed with HTTP ${status}.`
}

function extractTranscriptionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return ""
  }
  const responsePayload = payload as { text?: unknown }
  if (typeof responsePayload.text === "string") {
    return responsePayload.text.trim()
  }
  return ""
}

async function transcribeWithCandidate(
  candidate: SttCandidate,
  audioBlob: Blob,
  language?: string
): Promise<string> {
  const formData = new FormData()
  formData.append("file", audioBlob, "recording.webm")
  formData.append("model", candidate.model)
  if (language) {
    formData.append("language", language)
  }

  const response = await fetch(`${candidate.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${candidate.apiKey}`,
    },
    body: formData,
  })

  const contentType = response.headers.get("content-type") ?? ""
  const payload: unknown = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "")

  if (!response.ok) {
    throw new Error(extractProviderError(candidate.providerId, response.status, payload))
  }

  const text = extractTranscriptionText(payload)
  if (!text) {
    throw new Error(`[${candidate.providerId}] Transcription response did not include text.`)
  }

  return text
}

export async function POST(request: Request) {
  try {
    const user = getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const audio = formData.get("audio")
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio file." }, { status: 400 })
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: "Audio file is empty." }, { status: 400 })
    }

    const providerHint = normalizeProviderId(formData.get("provider"))
    const language = typeof formData.get("language") === "string"
      ? (formData.get("language") as string).trim() || undefined
      : undefined

    const candidates = getSttCandidates(providerHint)
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "No speech-to-text provider configured. Add a Groq or OpenAI API key in Settings > Providers." },
        { status: 400 }
      )
    }

    const errors: string[] = []
    for (const candidate of candidates) {
      try {
        const text = await transcribeWithCandidate(candidate, audio, language)
        return NextResponse.json({
          text,
          provider: candidate.providerId,
          model: candidate.model,
        })
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `[${candidate.providerId}] Unknown error.`)
      }
    }

    return NextResponse.json(
      { error: `Speech-to-text failed. ${errors.join(" ")}` },
      { status: 502 }
    )
  } catch (error) {
    console.error("[speech/transcribe] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
