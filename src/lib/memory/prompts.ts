const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction assistant. Your job is to identify new facts and preferences about the user from the conversation.

RULES:
1. Only extract information ABOUT THE USER (not about the AI, not general knowledge)
2. Each memory must be a single, concise statement (under 100 characters)
3. Classify each as "fact" (objective: name, job, location, tech stack, family) or "preference" (subjective: likes, dislikes, style preferences)
4. Do NOT repeat or rephrase any existing memories listed below
5. If there are no new memories to extract, return an empty array

EXISTING MEMORIES (do NOT repeat these):
{existingMemories}

RECENT CONVERSATION:
{recentMessages}

Respond ONLY with a valid JSON array. No markdown, no explanation.
Example: [{"type":"fact","content":"User works at Acme Corp"},{"type":"preference","content":"User prefers dark themes"}]
If no new memories: []`

export function buildExtractionPrompt(existingMemories: string[], recentMessages: string): string {
  const memoriesText = existingMemories.length > 0
    ? existingMemories.map(m => `- ${m}`).join("\n")
    : "(none)"

  return MEMORY_EXTRACTION_PROMPT
    .replace("{existingMemories}", memoriesText)
    .replace("{recentMessages}", recentMessages)
}
