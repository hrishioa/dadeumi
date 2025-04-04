/**
 * Constants used throughout the application
 */

/**
 * Context window limits (total input + output tokens) for different models
 * Note: These are the TOTAL context limits, not just output limits.
 * For example, GPT-4o has a 128K context window but may be limited to 16K output tokens.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI models
  "gpt-4.5-preview": 128000,
  "gpt-4o": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4-32k": 32000,
  "gpt-4": 8192,
  "gpt-3.5-turbo-16k": 16384,
  "gpt-3.5-turbo": 4096,

  // Claude models
  "claude-3-opus-20240229": 200000,
  "claude-3-sonnet-20240229": 200000,
  "claude-3-haiku-20240307": 200000,
  "claude-3-5-sonnet-20240620": 200000,
  "claude-3-7-sonnet-latest": 200000,

  // Default fallback (conservative estimate)
  default: 16384,
};
