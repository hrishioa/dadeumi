import { OpenAiProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { ConversationMessage } from "../../types";
import { pricingData } from "../../config/pricing";

// Direct export of interfaces instead of re-exporting from interfaces.ts
export interface AiResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
  duration: number; // in seconds
}

export interface AiRequestOptions {
  modelName: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

export interface AiProvider {
  generateResponse(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse>;
  isAvailable(): boolean;
  getProviderName(): string;
}

/**
 * Cost calculation result
 */
export interface CostResult {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Main AI service that orchestrates different providers
 */
export class AiService {
  private openAiProvider: OpenAiProvider;
  private anthropicProvider: AnthropicProvider;

  constructor(openAiApiKey?: string, anthropicApiKey?: string) {
    this.openAiProvider = new OpenAiProvider(openAiApiKey);
    this.anthropicProvider = new AnthropicProvider(anthropicApiKey);
  }

  /**
   * Check which providers are available
   */
  getAvailableProviders(): { openai: boolean; anthropic: boolean } {
    return {
      openai: this.openAiProvider.isAvailable(),
      anthropic: this.anthropicProvider.isAvailable(),
    };
  }

  /**
   * Generate a response from a conversation history using the appropriate provider
   */
  async generateResponse(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse> {
    const modelName = options.modelName;

    // Determine which provider to use based on model name
    if (
      modelName.startsWith("claude") ||
      modelName.includes("claude-") ||
      modelName.includes("anthropic")
    ) {
      if (!this.anthropicProvider.isAvailable()) {
        throw new Error(
          "Anthropic provider not available. Please set ANTHROPIC_API_KEY environment variable."
        );
      }
      return this.anthropicProvider.generateResponse(messages, options);
    } else {
      if (!this.openAiProvider.isAvailable()) {
        throw new Error(
          "OpenAI provider not available. Please set OPENAI_API_KEY environment variable."
        );
      }
      return this.openAiProvider.generateResponse(messages, options);
    }
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): CostResult {
    // Attempt to find exact match first, then base model
    let pricing = pricingData.get(model);

    if (!pricing) {
      // Try matching base model name
      const baseModelMatch = model.match(
        /^(gpt-4o|gpt-4o-mini|o1|o3-mini|claude-3-opus|claude-3-sonnet|claude-3-haiku|claude-3-5-sonnet|claude-3-7-sonnet)/
      );
      const baseModel = baseModelMatch ? baseModelMatch[0] : model;

      if (baseModel !== model) {
        pricing = pricingData.get(baseModel);
      }

      // Special handling for claude-3-7-sonnet-latest
      if (!pricing && model.includes("claude-3-7-sonnet")) {
        pricing = pricingData.get("claude-3-7-sonnet-latest");
      }
    }

    if (!pricing) {
      console.warn(`No pricing data found for model: ${model}`);
      return { inputCost: 0, outputCost: 0, totalCost: 0 };
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPerMillion;
    const outputCost =
      (outputTokens / 1_000_000) * pricing.outputCostPerMillion;
    const totalCost = inputCost + outputCost;

    return { inputCost, outputCost, totalCost };
  }
}
