/**
 * Translation Continuation Utilities
 * Functions for detecting incomplete translations and handling continuation
 */

import { OpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";

// Type for the continuation check response from OpenAI
interface ContinuationCheckResponse {
  continue: boolean;
  targetLastLine?: string;
  sourceLine?: string;
}

/**
 * Check if a translation is complete by using GPT-4o-mini in JSON mode
 * @param sourceText The original source text
 * @param translationText The current (potentially incomplete) translation
 * @param apiKey OpenAI API key (optional, will use env var if not provided)
 * @returns Object with continuation info or null if check failed
 */
export async function checkTranslationCompletion(
  sourceText: string,
  translationText: string,
  verbose = false,
  apiKey?: string
): Promise<ContinuationCheckResponse | null> {
  try {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    if (verbose) {
      console.log(chalk.cyan("🔍 Checking if translation is complete..."));
    }

    // Call GPT-4o-mini to check if translation is complete
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a translation verification assistant. You'll be given a source text and its translation. Your job is to determine if the translation is complete or if it got cut off. If incomplete, identify the last line in the translation and the corresponding source line to continue from.

Output JSON with these fields:
- continue: boolean indicating if translation needs to continue (true = incomplete)
- targetLastLine: the last line of the translation (required if continue=true)
- sourceLine: the corresponding source line (required if continue=true)

Requirements:
1. Match the last meaningful line in the translation and the corresponding source line
2. Ignore differences in formatting (newlines, spaces) when determining completeness
3. Verify that all major content sections exist in both source and translation`,
        },
        {
          role: "user",
          content: `Check if this translation is complete:

<source_text>
${sourceText}
</source_text>

<translation>
${translationText}
</translation>`,
        },
      ],
      temperature: 0,
      max_tokens: 1024,
    });

    // Parse the response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in response from OpenAI");
    }

    // Parse the JSON response
    const result = JSON.parse(content) as ContinuationCheckResponse;

    if (verbose) {
      if (result.continue) {
        console.log(chalk.yellow("⚠️ Translation is incomplete"));
        console.log(
          chalk.yellow(`  Last translated line: "${result.targetLastLine}"`)
        );
        console.log(
          chalk.yellow(`  Corresponding source line: "${result.sourceLine}"`)
        );
      } else {
        console.log(chalk.green("✅ Translation is complete"));
      }
    }

    return result;
  } catch (error) {
    console.error(
      chalk.red("❌ Error checking translation completion:"),
      error
    );
    return null;
  }
}

/**
 * Creates a continuation prompt to ask the model to continue from a specific line
 * @param sourceText The full source text
 * @param partialTranslation The partial translation so far
 * @param targetLastLine The last line of the translation to continue from
 * @param sourceLine The corresponding source line
 * @returns A prompt for the model to continue the translation
 */
export function createContinuationPrompt(
  sourceText: string,
  partialTranslation: string,
  targetLastLine: string,
  sourceLine: string
): string {
  // Take up to 5 sentences or 500 characters from the end of the partial translation for context
  const lastFewSentences = extractLastSentences(partialTranslation, 5, 500);

  // Ensure we have at least 5 words for matching (or take the full last line if it's shorter)
  let matchLine = targetLastLine;
  if (
    countWords(matchLine) < 5 &&
    partialTranslation.length > targetLastLine.length
  ) {
    // Try to get more context - grab more text from the end if available
    const lines = partialTranslation.split("\n");
    const lastLineIndex = lines.findIndex((line) =>
      line.includes(targetLastLine)
    );

    if (lastLineIndex > 0 && lastLineIndex < lines.length - 1) {
      // Use this line plus the next one if available
      matchLine = lines[lastLineIndex] + "\n" + lines[lastLineIndex + 1];
    } else if (partialTranslation.lastIndexOf(targetLastLine) !== -1) {
      // Get more context around the target line
      const position = partialTranslation.lastIndexOf(targetLastLine);
      const start = Math.max(0, position - 50);
      const end = Math.min(
        partialTranslation.length,
        position + targetLastLine.length + 50
      );
      matchLine = partialTranslation.substring(start, end);
    }
  }

  return `I need you to continue a translation that was cut off. The full source text and the partial translation are provided.

<source_text>
${sourceText}
</source_text>

<partial_translation>
${lastFewSentences}
</partial_translation>

This is not the full translation. Please continue from where it left off. Your continuation should start with this text (including it for matching purposes): "${matchLine}"

IMPORTANT:
1. Do not include XML tags like "<continued_translation>" in your response.
2. Start your response exactly with the text provided for matching.
3. Continue the translation in the same style, tone, formatting, and language as the existing translation.
4. Do not add notes like "(to be continued)" or similar markers.
5. If there is nothing more to translate, please indicate this clearly.

Your continuation will be automatically combined with the existing translation.`;
}

/**
 * Count the number of words in a string
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract the last N sentences from a text, up to maxChars
 */
function extractLastSentences(
  text: string,
  sentenceCount: number,
  maxChars: number
): string {
  // Handle empty text
  if (!text || text.trim().length === 0) return "";

  // Define sentence-ending punctuation
  const sentenceEndingRegex = /[.!?。？！…]+/g;

  // Get the last chunk of text, not exceeding maxChars
  const lastChunk =
    text.length <= maxChars ? text : text.substring(text.length - maxChars);

  // Split the last chunk into sentences
  const sentences = lastChunk.split(sentenceEndingRegex);

  // Get the last N sentences (or fewer if there aren't that many)
  const lastSentences = sentences.slice(
    Math.max(0, sentences.length - sentenceCount)
  );

  // If we got a clean break at a sentence, prepend an ellipsis
  const result = lastSentences.join(". ").trim();

  // Add ellipsis if we're not starting from the beginning of the text
  const needsEllipsis = text.length > maxChars && !text.startsWith(result);

  return needsEllipsis ? "..." + result : result;
}

/**
 * Saves a backup of the current partial translation before attempting to continue
 * @param filePath Path to the current translation file
 * @param backupDir Directory to store backups
 * @returns Path to the backup file or null if backup failed
 */
export function backupPartialTranslation(
  filePath: string,
  backupDir?: string
): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`❌ File not found: ${filePath}`));
      return null;
    }

    // Create backup directory if it doesn't exist
    const backupDirectory =
      backupDir || path.join(path.dirname(filePath), ".backups");
    if (!fs.existsSync(backupDirectory)) {
      fs.mkdirSync(backupDirectory, { recursive: true });
    }

    // Generate backup filename with timestamp
    const filename = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      backupDirectory,
      `${filename}.${timestamp}.bak`
    );

    // Copy the file
    fs.copyFileSync(filePath, backupPath);

    return backupPath;
  } catch (error) {
    console.error(chalk.red("❌ Error creating backup:"), error);
    return null;
  }
}

/**
 * Combines the partial translation with the continuation
 * @param partialTranslation The partial translation text
 * @param continuationText The continuation text from the model
 * @param targetLastLine The last line to match for replacement
 * @returns The combined translation or null if match failed
 */
export function combineTranslation(
  partialTranslation: string,
  continuationText: string,
  targetLastLine: string
): string | null {
  try {
    // Clean up continuation text first - remove XML tags if present
    let continued = cleanContinuationText(continuationText);

    // If no usable content after cleanup, return original
    if (!continued || continued.trim().length === 0) {
      console.log(
        chalk.yellow("⚠️ No usable continuation content found after cleanup")
      );
      return partialTranslation;
    }

    // Clean up the partial translation - remove any dangling XML tags at the end
    let cleanedPartialTranslation = removeUnpairedXmlTags(partialTranslation);

    // Also remove common "to be continued" markers from the end of the partial translation
    cleanedPartialTranslation = removeContinuationMarkers(
      cleanedPartialTranslation
    );

    // Find the best match point for continuing
    const matchResult = findBestMatchPoint(
      cleanedPartialTranslation,
      continued,
      targetLastLine
    );

    if (!matchResult) {
      console.error(
        chalk.red(
          `❌ Could not find a good match point in the partial translation using: "${targetLastLine}"`
        )
      );
      // As a fallback, just append the continuation to the end with a separator
      console.log(chalk.yellow("⚠️ Falling back to simple append method"));
      return cleanedPartialTranslation + "\n\n" + continued;
    }

    const { matchedText, matchIndex } = matchResult;

    // Get the text before the match, keeping the matched text in the original
    const textBefore = cleanedPartialTranslation.substring(
      0,
      matchIndex + matchedText.length
    );

    // Extract the continuation after the matched part
    let continuationAfterMatch = continued;
    if (continued.includes(matchedText)) {
      const matchStartInContinuation = continued.indexOf(matchedText);
      continuationAfterMatch = continued.substring(
        matchStartInContinuation + matchedText.length
      );
    }

    // Build combined text
    let combinedText = textBefore;

    // Add a separator if needed
    if (
      !combinedText.endsWith("\n") &&
      !continuationAfterMatch.startsWith("\n")
    ) {
      continuationAfterMatch = "\n" + continuationAfterMatch;
    }

    // Append the continuation
    combinedText += continuationAfterMatch;

    console.log(
      chalk.green(
        `✅ Successfully combined translation (${textBefore.length} chars + ${continuationAfterMatch.length} chars)`
      )
    );

    return combinedText;
  } catch (error) {
    console.error(chalk.red("❌ Error combining translation:"), error);
    return null;
  }
}

/**
 * Clean up continuation text by removing XML tags and other artifacts
 */
function cleanContinuationText(text: string): string {
  if (!text) return "";

  let cleaned = text;

  // Extract content from <continued_translation> tags if present
  const continuedMatch = text.match(
    /<continued_translation>([\s\S]*?)<\/continued_translation>/
  );

  if (continuedMatch && continuedMatch[1]?.trim()) {
    cleaned = continuedMatch[1].trim();
  } else {
    // If no tags found, use the raw text but remove any single open/close tags
    cleaned = text
      .trim()
      .replace(/<continued_translation>/g, "")
      .replace(/<\/continued_translation>/g, "");
  }

  // Remove any other XML-like tags that might be artifacts
  cleaned = removeUnpairedXmlTags(cleaned);

  // Remove "to be continued" markers
  cleaned = removeContinuationMarkers(cleaned);

  return cleaned;
}

/**
 * Remove unpaired XML tags from text (tags that are opened but not closed, or closed but not opened)
 */
export function removeUnpairedXmlTags(text: string): string {
  if (!text) return "";

  // Find all opening and closing tags
  const openingTags: string[] = [];
  const regex = /<([^\/\s>]+)[^>]*>|<\/([^>]+)>/g;
  let match;
  let result = text;

  // This will capture tag pairs to preserve and single tags to remove
  const tagsToRemove: string[] = [];

  // First pass - identify unpaired tags
  while ((match = regex.exec(text)) !== null) {
    const openTag = match[1];
    const closeTag = match[2];

    if (openTag) {
      // This is an opening tag
      openingTags.push(openTag);
    } else if (closeTag) {
      // This is a closing tag
      if (
        openingTags.length > 0 &&
        openingTags[openingTags.length - 1] === closeTag
      ) {
        // Matched pair, pop the opening tag
        openingTags.pop();
      } else {
        // Unpaired closing tag, mark for removal
        tagsToRemove.push(`</${closeTag}>`);
      }
    }
  }

  // Any tags left in the openingTags array are unpaired
  for (const tag of openingTags) {
    // Find the actual tag with attributes in the original text
    const openTagRegex = new RegExp(`<${tag}[^>]*>`, "g");
    let tagMatch;
    while ((tagMatch = openTagRegex.exec(text)) !== null) {
      if (!tagsToRemove.includes(tagMatch[0])) {
        tagsToRemove.push(tagMatch[0]);
      }
    }
  }

  // Remove the unpaired tags
  for (const tag of tagsToRemove) {
    result = result.replace(tag, "");
  }

  return result;
}

/**
 * Remove common "to be continued" markers from the end of text
 */
export function removeContinuationMarkers(text: string): string {
  if (!text) return "";

  // Common continuation markers in various languages
  const markers = [
    /\(to be continued\.?\.?\.?\)$/i,
    /\(continued\.?\.?\.?\)$/i,
    /\.\.\.$/, // Just trailing ellipsis at the end
    /\(계속\.?\.?\.?\)$/i, // Korean
    /\(다음 편에 계속\.?\.?\.?\)$/i, // Korean
    /\(fortsetzung folgt\.?\.?\.?\)$/i, // German
    /\(continuará\.?\.?\.?\)$/i, // Spanish
    /\(à suivre\.?\.?\.?\)$/i, // French
    /\(続く\.?\.?\.?\)$/i, // Japanese
    /\(未完成\.?\.?\.?\)$/i, // Chinese
    /\(未完待续\.?\.?\.?\)$/i, // Chinese
  ];

  let cleaned = text;

  // Check for and remove continuation markers at the end
  for (const marker of markers) {
    cleaned = cleaned.replace(marker, "");
  }

  return cleaned.trim();
}

/**
 * Find the best match point between a partial translation and its continuation
 * @returns Object with matched text and index, or null if no match found
 */
function findBestMatchPoint(
  partialTranslation: string,
  continuation: string,
  targetLastLine: string
): { matchedText: string; matchIndex: number } | null {
  if (!partialTranslation || !continuation) return null;

  // First try to match the exact target line
  const exactMatch = partialTranslation.lastIndexOf(targetLastLine);
  if (exactMatch !== -1 && targetLastLine.trim().length > 0) {
    return {
      matchedText: targetLastLine,
      matchIndex: exactMatch,
    };
  }

  // If that fails, try to find the longest matching sequence between the end
  // of the partial translation and the beginning of the continuation
  const minMatchLength = Math.min(5, targetLastLine.length); // At least 5 chars or the entire targetLastLine
  let bestMatch = "";
  let bestMatchIndex = -1;

  // Get the last 200 characters of the partial translation for matching
  const endChunk = partialTranslation.substring(
    Math.max(0, partialTranslation.length - 200)
  );

  // Get the first 200 characters of the continuation for matching
  const startChunk = continuation.substring(
    0,
    Math.min(continuation.length, 200)
  );

  // Try finding increasingly smaller parts of the end chunk in the start chunk
  for (let length = endChunk.length; length >= minMatchLength; length--) {
    const endPart = endChunk.substring(endChunk.length - length);
    if (startChunk.includes(endPart)) {
      bestMatch = endPart;
      bestMatchIndex = partialTranslation.lastIndexOf(endPart);
      break;
    }
  }

  // If we found a good match
  if (bestMatchIndex !== -1 && bestMatch.length >= minMatchLength) {
    return {
      matchedText: bestMatch,
      matchIndex: bestMatchIndex,
    };
  }

  // Last resort - try to match the last paragraph
  const paragraphs = partialTranslation.split(/\n\n+/);
  if (paragraphs.length > 0) {
    const lastParagraph = paragraphs[paragraphs.length - 1].trim();
    const paragraphIndex = partialTranslation.lastIndexOf(lastParagraph);

    if (paragraphIndex !== -1 && lastParagraph.length >= minMatchLength) {
      return {
        matchedText: lastParagraph,
        matchIndex: paragraphIndex,
      };
    }
  }

  // No good match found
  return null;
}

/**
 * Creates a simple "please continue" prompt that preserves the existing conversation context
 * @param targetLastLine The last line of the truncated response to continue from
 * @returns A prompt asking the model to continue from where it left off
 */
export function createSimpleContinuationPrompt(targetLastLine: string): string {
  return `Your response appeared to be cut off. Please continue your translation from where you left off, starting at this point:

"${targetLastLine.trim()}"

Please continue in the same style, tone, and approach as you were using before. Don't repeat what you've already translated - just continue from exactly where you left off.`;
}
