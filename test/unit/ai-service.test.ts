import { describe, test, expect, mock } from "bun:test";
import { MockAiProvider } from "../mocks/ai-service.mock";
import { AiRequestOptions } from "../../src/services/ai/interfaces";
import { ConversationMessage } from "../../src/types";

describe("AI Service", () => {
  // Use our mock AI provider for testing
  const mockProvider = new MockAiProvider();

  // Example conversation for testing
  const conversation: ConversationMessage[] = [
    {
      role: "system",
      content: "You are a helpful translation assistant.",
    },
    {
      role: "user",
      content: "Please help me with initial analysis of this text.",
    },
  ];

  // Generic options
  const options: AiRequestOptions = {
    modelName: "test-model",
    maxOutputTokens: 1000,
    temperature: 0.7,
  };

  test("should generate a response matching keywords", async () => {
    const response = await mockProvider.generateResponse(conversation, options);

    expect(response.content).toContain("<analysis>");
    expect(response.content).toContain("</analysis>");
    expect(response.modelName).toBe("test-model");
    expect(response.inputTokens).toBeGreaterThan(0);
    expect(response.outputTokens).toBeGreaterThan(0);
    expect(response.duration).toBeDefined();
  });

  test("should use custom mock responses", async () => {
    const customResponse = "<custom_tag>This is a custom response</custom_tag>";
    mockProvider.setMockResponse("expression", customResponse);

    const customConversation: ConversationMessage[] = [
      {
        role: "user",
        content: "Please help with expression exploration",
      },
    ];

    const response = await mockProvider.generateResponse(
      customConversation,
      options
    );
    expect(response.content).toBe(customResponse);
  });

  test("should use default response for unmatched prompts", async () => {
    mockProvider.setDefaultResponse("Default unmatched response");

    const unrelatedConversation: ConversationMessage[] = [
      {
        role: "user",
        content: "Something completely unrelated to any keyword",
      },
    ];

    const response = await mockProvider.generateResponse(
      unrelatedConversation,
      options
    );
    expect(response.content).toBe("Default unmatched response");
  });

  test("should allow configuring response delay", async () => {
    // Set a short delay for testing
    mockProvider.setDelay(50);

    const startTime = Date.now();
    await mockProvider.generateResponse(conversation, options);
    const endTime = Date.now();

    // The delay should be at least what we set
    expect(endTime - startTime).toBeGreaterThanOrEqual(50);
  });

  test("should always report as available", () => {
    expect(mockProvider.isAvailable()).toBe(true);
    expect(mockProvider.getProviderName()).toBe("MockAI");
  });
});
