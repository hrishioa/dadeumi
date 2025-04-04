/**
 * Dadeumi TypeScript Usage Examples
 *
 * This file demonstrates how to use Dadeumi in a TypeScript project.
 */

import { translate, TranslationWorkflow, TranslationConfig } from "dadeumi";
import * as fs from "fs";
import * as path from "path";

// Basic translation with TypeScript
async function basicTranslation(): Promise<void> {
  try {
    const result = await translate(
      "Hello world! This is a TypeScript example.",
      "Spanish"
    );

    console.log("Translation result:", result);
  } catch (error) {
    console.error("Translation failed:", error);
  }
}

// Advanced translation with full type safety
async function advancedTranslation(): Promise<void> {
  try {
    const result = await translate(
      "This is a more complex TypeScript example with various options configured.",
      "Japanese",
      {
        // All options are properly typed
        sourceLanguage: "English",
        modelName: "gpt-4o",
        verbose: true,
        outputDir: "./translations-output",
        skipExternalReview: true,
        customInstructions:
          "Translate with a formal, respectful tone appropriate for business context.",
        reasoningEffort: "medium", // Type-safe: only "low" | "medium" | "high" are allowed
      }
    );

    console.log("Advanced translation result:", result);
  } catch (error) {
    console.error("Advanced translation failed:", error);
  }
}

// Using the TranslationWorkflow class with full type safety
async function workflowTranslation(): Promise<void> {
  try {
    // TranslationConfig is fully typed
    const config: TranslationConfig = {
      sourceText:
        "This example uses the TranslationWorkflow class with TypeScript.",
      targetLanguage: "Korean",
      sourceLanguage: "English",
      outputDir: "./workflow-translations",
      modelName: "claude-3-7-sonnet-latest",
      verbose: true,
      maxRetries: 2,
      retryDelay: 3000,
      skipExternalReview: false,
      customInstructions:
        "Translate with a poetic style, preserving imagery and rhythm.",
      reasoningEffort: "high",
      maxOutputTokens: 25000,
      originalFilename: "example",
      originalExtension: ".txt",
      inputPath: "./example.txt",
    };

    const workflow = new TranslationWorkflow(config);
    await workflow.execute();

    console.log("Workflow translation completed!");
  } catch (error) {
    console.error("Workflow translation failed:", error);
  }
}

// Type-safe interface for batch file processing
interface TranslationFile {
  path: string;
  name: string;
  sourceLanguage?: string;
}

async function batchTranslation(): Promise<void> {
  const filesToTranslate: TranslationFile[] = [
    { path: "./documents/doc1.txt", name: "document1" },
    {
      path: "./documents/doc2.txt",
      name: "document2",
      sourceLanguage: "French",
    },
    { path: "./documents/doc3.txt", name: "document3" },
  ];

  for (const file of filesToTranslate) {
    try {
      // Read file content with proper error handling
      if (!fs.existsSync(file.path)) {
        throw new Error(`File not found: ${file.path}`);
      }

      const content = fs.readFileSync(file.path, "utf8");

      console.log(`Translating ${file.name}...`);

      // Create output directory if it doesn't exist
      const outputDir = `./batch-translations/${file.name}`;
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Translate content with optional source language
      const result = await translate(content, "German", {
        sourceLanguage: file.sourceLanguage,
        outputDir,
        verbose: false,
      });

      // Save result
      const outputPath = path.join(outputDir, `${file.name}-German.txt`);
      fs.writeFileSync(outputPath, result);
      console.log(`✅ ${file.name} translated successfully to: ${outputPath}`);
    } catch (error) {
      console.error(`❌ Failed to translate ${file.name}:`, error);
    }
  }
}

// Error handling example with TypeScript
async function errorHandlingExample(): Promise<void> {
  try {
    // Call with invalid configuration to demonstrate error handling
    await translate(
      "", // Empty source text will cause an error
      "French"
    );
  } catch (error) {
    // TypeScript-friendly error handling
    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    } else {
      console.error("Unknown error:", error);
    }

    // Log error and continue with fallback behavior
    console.log("Using fallback translation method...");
  }
}

// Run examples (uncomment to execute)
// basicTranslation();
// advancedTranslation();
// workflowTranslation();
// batchTranslation();
// errorHandlingExample();
