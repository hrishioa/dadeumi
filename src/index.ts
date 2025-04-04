/**
 * Daedumi - AI-powered literary translation workflow
 *
 * This module exports the Daedumi public API for use as a library.
 */

// Re-export types
export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TranslationConfig {
  sourceLanguage?: string; // Optional, can be auto-detected
  targetLanguage: string;
  sourceText: string;
  outputDir: string;
  modelName: string;
  verbose: boolean;
  maxRetries: number;
  retryDelay: number;
  skipExternalReview: boolean;
  customInstructions?: string;
  reasoningEffort: "low" | "medium" | "high";
  maxOutputTokens: number;
  originalFilename: string; // Used for final output filename
  originalExtension: string; // Used for final output filename
  inputPath: string; // For convenience
}

export interface TranslationMetrics {
  sourceWordCount: number;
  targetWordCount: number;
  sourceCharCount: number;
  targetCharCount: number;
  ratio: number;
  estimatedReadingTime: number;
}

// Re-export main functionality
export { TranslationWorkflow } from "./core/TranslationWorkflow";
export { AiService } from "./services/ai";
export { XmlProcessor } from "./utils/xml";
export { Logger } from "./utils/logger";

// Re-export utility functions
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
  const { TranslationWorkflow } = await import("./core/TranslationWorkflow");

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

  // Use dynamic import for fs to avoid bundling issues
  const fs = await import("fs");
  if (fs.existsSync(outputPath)) {
    return fs.readFileSync(outputPath, "utf-8");
  }

  throw new Error("Translation failed: no output file generated");
}
