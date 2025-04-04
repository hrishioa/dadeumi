import { TranslationMetrics } from "../types";

/**
 * Calculate metrics for a piece of text
 */
export function calculateMetrics(
  text: string,
  isSourceText: boolean = false,
  sourceMetrics?: TranslationMetrics
): TranslationMetrics {
  // Handle null or empty texts
  if (!text) {
    return {
      sourceWordCount: 0,
      targetWordCount: 0,
      sourceCharCount: 0,
      targetCharCount: 0,
      ratio: 0,
      estimatedReadingTime: 0,
    };
  }

  // Count characters (excluding whitespace)
  const charCount = text.replace(/\s/g, "").length;

  // Count words - simple implementation for most languages
  // For languages like Chinese/Japanese, use a different method
  let wordCount = 0;

  // Use generic word counting by default
  wordCount = text.split(/\s+/).filter((word) => word.length > 0).length;

  // Calculate estimated reading time (words per minute)
  // Average reading speed is about 200-250 words per minute
  const readingTime = wordCount / 200;

  // If calculating for source text, source and target are the same
  // Otherwise, use the provided source metrics
  const sourceW = isSourceText
    ? wordCount
    : sourceMetrics?.sourceWordCount ?? 0;
  const sourceC = isSourceText
    ? charCount
    : sourceMetrics?.sourceCharCount ?? 0;

  return {
    sourceWordCount: sourceW,
    targetWordCount: wordCount,
    sourceCharCount: sourceC,
    targetCharCount: charCount,
    ratio: sourceW > 0 ? wordCount / sourceW : 0, // Avoid division by zero
    estimatedReadingTime: readingTime,
  };
}

/**
 * Enhanced metrics calculation that considers the target language
 */
export function calculateMetricsForLanguage(
  text: string,
  language: string | undefined,
  isSourceText: boolean = false,
  sourceMetrics?: TranslationMetrics
): TranslationMetrics {
  // Handle null or empty texts
  if (!text) {
    return {
      sourceWordCount: 0,
      targetWordCount: 0,
      sourceCharCount: 0,
      targetCharCount: 0,
      ratio: 0,
      estimatedReadingTime: 0,
    };
  }

  // Count characters (excluding whitespace)
  const charCount = text.replace(/\s/g, "").length;

  // Count words based on language properties
  let wordCount = 0;

  // Default to language from parameters, normalize to lowercase
  const effectiveLanguage = language?.toLowerCase() || "";

  if (
    effectiveLanguage === "korean" ||
    effectiveLanguage === "japanese" ||
    effectiveLanguage === "chinese"
  ) {
    // For character-based languages, estimate based on characters
    wordCount = Math.round(charCount / 2); // Very rough approximation
  } else {
    // For space-separated languages
    wordCount = text.split(/\s+/).filter((word) => word.length > 0).length;
  }

  // Calculate estimated reading time (words per minute)
  // Average reading speed is about 200-250 words per minute
  const readingTime = wordCount / 200;

  // If calculating for source text, source and target are the same
  const sourceW = isSourceText
    ? wordCount
    : sourceMetrics?.sourceWordCount ?? 0;
  const sourceC = isSourceText
    ? charCount
    : sourceMetrics?.sourceCharCount ?? 0;

  return {
    sourceWordCount: sourceW,
    targetWordCount: wordCount,
    sourceCharCount: sourceC,
    targetCharCount: charCount,
    ratio: sourceW > 0 ? wordCount / sourceW : 0, // Avoid division by zero
    estimatedReadingTime: readingTime,
  };
}
