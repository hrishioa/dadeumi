import {
  AiProvider,
  AiRequestOptions,
  AiResponse,
} from "../../src/services/ai/interfaces";
import { ConversationMessage } from "../../src/types";

/**
 * Mock AI provider for testing
 */
export class MockAiProvider implements AiProvider {
  private responses: Record<string, string> = {};
  private defaultResponse = "Mock AI response";
  private delay = 10; // ms

  constructor() {
    // Set up some default mock responses for common scenarios
    this.responses["analysis"] = `<analysis>
      This is a mock analysis of the text.
      It discusses the tone, style, and cultural elements.
    </analysis>`;

    this.responses["expression_exploration"] = `<expression_exploration>
      Here are some ways to express these concepts in the target language.
      Several idioms and cultural references are discussed.
    </expression_exploration>`;

    this.responses["first_translation"] = `<first_translation>
      This is a mock first draft translation of the text.
      It attempts to capture the original's essence.
    </first_translation>`;
  }

  /**
   * Set a custom mock response for a prompt
   */
  setMockResponse(promptKeyword: string, response: string): void {
    this.responses[promptKeyword] = response;
  }

  /**
   * Set the default response for unmatched prompts
   */
  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }

  /**
   * Set mock delay time in milliseconds
   */
  setDelay(ms: number): void {
    this.delay = ms;
  }

  /**
   * Implementation of AiProvider interface
   */
  getProviderName(): string {
    return "MockAI";
  }

  isAvailable(): boolean {
    return true;
  }

  async generateResponse(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, this.delay));

    // Get the user's prompt (usually the last message)
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const prompt = lastUserMessage?.content || "";

    // Find a matching response based on keywords in the prompt
    let responseContent = this.defaultResponse;

    for (const [keyword, response] of Object.entries(this.responses)) {
      if (prompt.toLowerCase().includes(keyword.toLowerCase())) {
        responseContent = response;
        break;
      }
    }

    // Return a simulated response
    return {
      content: responseContent,
      inputTokens: prompt.length / 4, // Roughly estimate tokens
      outputTokens: responseContent.length / 4,
      modelName: options.modelName || "mock-model",
      duration: this.delay / 1000,
    };
  }
}

/**
 * Mock AI service with predefined responses
 */
export class MockAiService {
  private provider = new MockAiProvider();

  /**
   * Get the provider instance
   */
  getProvider(): MockAiProvider {
    return this.provider;
  }

  /**
   * Generate a response using the mock provider
   */
  async generateResponse(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse> {
    return this.provider.generateResponse(messages, options);
  }

  /**
   * Calculate estimated cost
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): { inputCost: number; outputCost: number; totalCost: number } {
    // Use some mock pricing
    const inputCost = (inputTokens / 1_000_000) * 10;
    const outputCost = (outputTokens / 1_000_000) * 30;
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  }

  /**
   * Check availability
   */
  getAvailableProviders(): { openai: boolean; anthropic: boolean } {
    return {
      openai: true,
      anthropic: true,
    };
  }
}
