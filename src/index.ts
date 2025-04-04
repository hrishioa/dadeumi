/**
 * Daedumi - AI-powered literary translation workflow
 *
 * This module exports the Daedumi public API for use as a library.
 */

// Import core classes
import { TranslationWorkflow } from "./core/TranslationWorkflow";
import {
  ConversationMessage,
  TranslationConfig,
  TranslationMetrics,
} from "./types";

// Export core workflow
export { TranslationWorkflow } from "./core/TranslationWorkflow";

// Export types
export {
  ConversationMessage,
  TranslationConfig,
  TranslationMetrics,
} from "./types";

// Export AI services
export {
  AiService,
  AiProvider,
  AiRequestOptions,
  AiResponse,
  CostResult,
} from "./services/ai";

// Export utilities
export {
  calculateMetrics,
  calculateMetricsForLanguage,
  formatTime,
  formatDuration,
  saveText,
  loadText,
  saveJson,
  loadJson,
  findLatestFile,
  ensureDirectoryExists,
} from "./utils";

// Export XML processor
export { XmlProcessor } from "./utils/xml";

// Export logger
export { Logger } from "./utils/logger";

/**
 * Simple standalone function to translate text
 */
export async function translate(
  text: string,
  targetLanguage: string,
  options?: {
    sourceLanguage?: string;
    modelName?: string;
    outputDir?: string;
    verbose?: boolean;
    skipExternalReview?: boolean;
    customInstructions?: string;
  }
): Promise<string> {
  // Use current directory as output if not specified
  const outputDir = options?.outputDir || process.cwd();

  // Create a translation config
  const config: TranslationConfig = {
    sourceText: text,
    targetLanguage,
    sourceLanguage: options?.sourceLanguage,
    modelName: options?.modelName || "gpt-4o",
    outputDir,
    verbose: options?.verbose !== undefined ? options.verbose : false,
    maxRetries: 3,
    retryDelay: 5000,
    skipExternalReview:
      options?.skipExternalReview !== undefined
        ? options.skipExternalReview
        : false,
    customInstructions: options?.customInstructions,
    reasoningEffort: "medium",
    maxOutputTokens: 30000,
    originalFilename: "translation",
    originalExtension: ".txt",
    inputPath: "memory", // No actual file input
  };

  // Create and execute workflow
  const workflow = new TranslationWorkflow(config);
  await workflow.execute();

  // Return the translated text from the output file
  const outputPath = `${outputDir}/translation-${targetLanguage}.txt`;

  // Read the output file and return its contents
  const fs = require("fs");
  if (fs.existsSync(outputPath)) {
    return fs.readFileSync(outputPath, "utf-8");
  }

  throw new Error("Translation failed: no output file generated");
}
