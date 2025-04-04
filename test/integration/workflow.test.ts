import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { TranslationWorkflow } from "../../src/core/TranslationWorkflow";
import { TranslationConfig } from "../../src/types";
import { MockAiService } from "../mocks/ai-service.mock";
import { AiService } from "../../src/services/ai";

// Mock the AI service
// @ts-ignore - Ignore TypeScript errors for mocking
TranslationWorkflow.prototype["aiService"] = new MockAiService();

describe("TranslationWorkflow", () => {
  const testDir = path.join(process.cwd(), "test", "temp-workflow");
  const testFile = path.join(process.cwd(), "test", "fixtures", "sample.txt");

  let config: TranslationConfig;
  let workflow: TranslationWorkflow;
  let sourceText: string;

  // Set up the test environment
  beforeEach(() => {
    // Ensure test directory exists and is empty
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      files.forEach((file) => {
        const filePath = path.join(testDir, file);
        if (fs.statSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      });
    } else {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Read the test fixture
    sourceText = fs.readFileSync(testFile, "utf-8");

    // Create a test configuration
    config = {
      sourceLanguage: "English",
      targetLanguage: "Spanish",
      sourceText,
      outputDir: testDir,
      modelName: "test-model",
      verbose: false, // Set to true for debugging
      maxRetries: 1,
      retryDelay: 10,
      skipExternalReview: true,
      reasoningEffort: "low",
      maxOutputTokens: 1000,
      originalFilename: "test-file",
      originalExtension: ".txt",
      inputPath: testFile,
    };

    // Configure mock responses
    const mockService = new MockAiService();
    const provider = mockService.getProvider();

    provider.setMockResponse(
      "initial analysis",
      `<analysis>
      This is a mock analysis of the cultural exchange text.
      It has a formal tone with academic language.
    </analysis>`
    );

    provider.setMockResponse(
      "expression exploration",
      `<expression_exploration>
      Spanish equivalents for key terms:
      - Cultural exchange = intercambio cultural
      - Global citizenship = ciudadanía global
    </expression_exploration>`
    );

    provider.setMockResponse(
      "first translation",
      `<first_translation>
      La Importancia del Intercambio Cultural

      En nuestro mundo cada vez más interconectado, el intercambio cultural se ha vuelto más importante que nunca.
    </first_translation>`
    );

    // Set default mock response for any unmatched prompts
    provider.setDefaultResponse(`<default_tag>
      This is a default mock response for any unmatched prompt.
      It would normally contain translated content.
    </default_tag>`);

    // Create a workflow instance with the mocked service
    workflow = new TranslationWorkflow(config);

    // Replace the AI service with our mock
    // @ts-ignore - Ignore TypeScript errors for private property access
    workflow["aiService"] = mockService;
  });

  // Clean up after tests
  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("should initialize properly", () => {
    // @ts-ignore - Accessing private properties for testing
    expect(workflow["config"]).toEqual(config);

    // @ts-ignore - Accessing private properties for testing
    expect(workflow["sourceMetrics"]).toBeDefined();
    expect(workflow["sourceMetrics"].sourceWordCount).toBeGreaterThan(0);
  });

  // Note: We're not testing the full execute method yet since we haven't implemented
  // all the translation steps. We can add more tests as we implement them.

  test("should save conversation history", () => {
    // @ts-ignore - Accessing private method for testing
    workflow["saveConversationHistory"]("Test History");

    // @ts-ignore - Accessing private properties for testing
    const jsonPath = workflow["conversationJsonPath"];
    const textPath = workflow["conversationTextPath"];

    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(textPath)).toBe(true);

    // Verify JSON content
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    expect(jsonContent.metadata.label).toBe("Test History");
    expect(Array.isArray(jsonContent.conversation)).toBe(true);
  });

  test("should handle error recovery", () => {
    // Create a file that would be found during error recovery
    const intermediatesDir = path.join(testDir, ".translation-intermediates");
    fs.mkdirSync(intermediatesDir, { recursive: true });

    const testTranslation = "This is a test translation for error recovery";
    const translationFile = path.join(
      intermediatesDir,
      "05_first_translation.txt"
    );
    fs.writeFileSync(translationFile, testTranslation);

    // Call the error recovery method
    workflow.saveLatestTranslationOnError();

    // Check that the final output file was created with the correct content
    const finalPath = path.join(testDir, `test-file-Spanish.txt`);
    expect(fs.existsSync(finalPath)).toBe(true);
    expect(fs.readFileSync(finalPath, "utf-8")).toBe(testTranslation);
  });
});
