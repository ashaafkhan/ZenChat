import { groq } from '@ai-sdk/groq';

export const DEFAULT_CHAT_MODEL = "openai/gpt-oss-120b";

export function getChatModel(modelId?: string | null) {
    return groq(modelId || DEFAULT_CHAT_MODEL);
} 