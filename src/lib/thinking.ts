export const THINKING_LEVELS = ["off", "low", "medium", "high"] as const

export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "off"

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
}

export function normalizeThinkingLevel(value: unknown): ThinkingLevel {
  return THINKING_LEVELS.includes(value as ThinkingLevel)
    ? value as ThinkingLevel
    : DEFAULT_THINKING_LEVEL
}
