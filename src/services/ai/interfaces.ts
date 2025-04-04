import { ConversationMessage } from "../../types";

/**
 * Response from an AI model call
 */
export interface AiResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
  duration: number; // in seconds
}

/**
 * Options for AI model calls
 */
export interface AiRequestOptions {
  modelName: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * Interface for AI service providers (OpenAI, Anthropic, etc.)
 */
export interface AiProvider {
  /**
   * Generate a response from a conversation history
   */
  generateResponse(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse>;

  /**
   * Check if the provider is available (API key exists, etc.)
   */
  isAvailable(): boolean;

  /**
   * Get the provider name
   */
  getProviderName(): string;
}
