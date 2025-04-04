import { OpenAI } from "openai";
import { AiProvider, AiRequestOptions, AiResponse } from ".";
import { ConversationMessage } from "../../types";

/**
 * OpenAI service provider implementation
 */
export class OpenAiProvider implements AiProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  getProviderName(): string {
    return "OpenAI";
  }

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async generateResponse(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse> {
    const modelName = options.modelName;
    const isReasoningModel =
      modelName.startsWith("o1") || modelName.startsWith("o3");

    // Record start time for duration calculation
    const startTime = performance.now();

    if (isReasoningModel) {
      return await this.callResponsesApi(messages, options);
    } else {
      return await this.callChatCompletionsApi(messages, options);
    }
  }

  /**
   * Call the OpenAI Responses API (for o1/o3 models)
   */
  private async callResponsesApi(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse> {
    // Format input for Responses API (combine system + user prompt)
    let combinedPrompt = "";
    if (messages[0]?.role === "system") {
      combinedPrompt = messages[0].content + "\n\n---\n\n";
      combinedPrompt += messages
        .slice(1)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");
    } else {
      combinedPrompt = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");
    }

    const startTime = performance.now();

    const response = await this.client.responses.create({
      model: options.modelName,
      input: [{ role: "user", content: combinedPrompt }],
      reasoning: { effort: options.reasoningEffort || "medium" },
      max_output_tokens: options.maxOutputTokens,
    });

    const endTime = performance.now();

    return {
      content: response.output_text || "",
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      modelName: options.modelName,
      duration: (endTime - startTime) / 1000, // convert to seconds
    };
  }

  /**
   * Call the OpenAI Chat Completions API (for GPT models)
   */
  private async callChatCompletionsApi(
    messages: ConversationMessage[],
    options: AiRequestOptions
  ): Promise<AiResponse> {
    const startTime = performance.now();

    const completion = await this.client.chat.completions.create({
      model: options.modelName,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxOutputTokens,
    });

    const endTime = performance.now();

    return {
      content: completion.choices[0].message.content || "",
      inputTokens: completion.usage?.prompt_tokens || 0,
      outputTokens: completion.usage?.completion_tokens || 0,
      modelName: options.modelName,
      duration: (endTime - startTime) / 1000, // convert to seconds
    };
  }
}
