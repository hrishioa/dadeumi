import Anthropic from "@anthropic-ai/sdk";
import { AiProvider, AiRequestOptions, AiResponse } from ".";
import { ConversationMessage } from "../../types";

/**
 * Anthropic (Claude) service provider implementation
 */
export class AnthropicProvider implements AiProvider {
  private client: Anthropic | null = null;

  constructor(apiKey?: string) {
    try {
      this.client = new Anthropic({
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY || "",
      });
    } catch (error) {
      console.warn("Failed to initialize Anthropic client:", error);
      this.client = null;
    }
  }

  getProviderName(): string {
    return "Anthropic Claude";
  }

  isAvailable(): boolean {
    return !!this.client && !!process.env.ANTHROPIC_API_KEY;
  }

  async generateResponse(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse> {
    if (!this.client) {
      throw new Error("Anthropic client not initialized");
    }

    console.log(
      "Anthropic Provider: Generating response with model:",
      options.modelName
    );

    // Format messages for Anthropic API
    const formattedMessages: Array<{
      role: "user" | "assistant";
      content: string;
    }> = [];

    // Extract system message if present
    let systemMessage: string | undefined;
    let startIndex = 0;

    if (messages[0]?.role === "system") {
      systemMessage = messages[0].content;
      startIndex = 1;
      console.log(
        "System message extracted:",
        systemMessage.substring(0, 50) + "..."
      );
    }

    // Format remaining messages
    for (let i = startIndex; i < messages.length; i++) {
      const msg = messages[i];
      formattedMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    console.log(
      `Formatted ${formattedMessages.length} messages for Claude API`
    );

    const startTime = performance.now();

    try {
      // Use the standard messages.create method
      const response = await this.client.messages.create({
        model: options.modelName || "claude-3-7-sonnet-latest",
        max_tokens: options.maxOutputTokens || 100000,
        temperature: options.temperature || 0.7,
        system: systemMessage,
        messages: formattedMessages,
      });

      const endTime = performance.now();

      let content = "";
      if (
        response.content &&
        response.content.length > 0 &&
        "text" in response.content[0]
      ) {
        content = response.content[0].text;
      }

      console.log("Anthropic response received successfully");

      return {
        content,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        modelName: options.modelName || "claude-3-7-sonnet-latest",
        duration: (endTime - startTime) / 1000,
      };
    } catch (error: any) {
      console.error("Anthropic API error:", error?.message || error);

      // Log details of the request that failed
      console.error("Request details:");
      console.error(
        "- Model:",
        options.modelName || "claude-3-7-sonnet-latest"
      );
      console.error("- Max tokens:", options.maxOutputTokens || 100000);
      console.error("- Temperature:", options.temperature || 0.7);
      console.error("- System message present:", !!systemMessage);
      console.error("- Number of messages:", formattedMessages.length);

      // Log more detailed error information to help with debugging
      if (error?.status) {
        console.error(
          `Status: ${error.status}, Type: ${error?.error?.type || "unknown"}`
        );
      }

      throw error;
    }
  }
}
