/** Gemini's OpenAI-compatible endpoint. Any OpenAI-compatible server works, e.g. http://localhost:11434/v1/ (Ollama). */
export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const MODEL_PRESETS: readonly string[] = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
/** Former presets. New Gemini projects cannot call them (404), so a saved one moves to the default on load. */
export const RETIRED_PRESETS: readonly string[] = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];

/**
 * Thinking effort sent to Gemini. Gemini 3 thinks at a medium level by default, which can take tens of seconds
 * before the first token; a short follow-up does not need it. Documented as supported by Gemini's
 * OpenAI-compatible endpoint. Sent only to Gemini's own host: other servers (Ollama, llama.cpp) may reject it.
 */
export const GEMINI_REASONING_EFFORT = 'low';

export function isGeminiBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl.trim()).hostname === 'generativelanguage.googleapis.com';
  } catch {
    return false;
  }
}
