/**
 * Core type definitions for Daedumi translation workflow
 */

/**
 * Represents a message in the AI conversation
 */
export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Configuration for the translation process
 */
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

/**
 * Metrics calculated for source and translated text
 */
export interface TranslationMetrics {
  sourceWordCount: number;
  targetWordCount: number;
  sourceCharCount: number;
  targetCharCount: number;
  ratio: number;
  estimatedReadingTime: number;
}

/**
 * Model pricing information
 */
export interface ModelPricing {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}
