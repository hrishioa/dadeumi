/**
 * Daedumi Programmatic Usage Examples
 *
 * This file demonstrates various ways to use Daedumi as a library in your applications.
 */

// Import the library (ESM style)
import { translate, TranslationWorkflow } from "daedumi";

// For CommonJS:
// const { translate, TranslationWorkflow } = require('daedumi');

// Basic usage with async/await
async function basicTranslation() {
  try {
    // Simple translation with minimal options
    const result = await translate(
      "Hello world! This is a test of the translation system.",
      "Spanish"
    );

    console.log("Translation result:", result);
  } catch (error) {
    console.error("Translation failed:", error);
  }
}

// More advanced options
async function advancedTranslation() {
  try {
    const result = await translate(
      "This is a more complex example with various options configured.",
      "Japanese",
      {
        // Explicitly specify source language (optional)
        sourceLanguage: "English",

        // Choose a specific model
        modelName: "gpt-4o",

        // Show detailed logs
        verbose: true,

        // Specify where to save intermediate files
        outputDir: "./translations-output",

        // Skip the external review step
        skipExternalReview: true,

        // Add custom instructions
        customInstructions:
          "Translate with a formal, respectful tone appropriate for business context.",
      }
    );

    console.log("Advanced translation result:", result);
  } catch (error) {
    console.error("Advanced translation failed:", error);
  }
}

// Using the TranslationWorkflow class directly for maximum control
async function workflowTranslation() {
  try {
    const config = {
      sourceText:
        "This example uses the TranslationWorkflow class directly for maximum control.",
      targetLanguage: "Korean",
      sourceLanguage: "English",
      outputDir: "./workflow-translations",
      modelName: "claude-3-7-sonnet-latest", // Requires ANTHROPIC_API_KEY
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

// Process multiple files in a batch
async function batchTranslation() {
  const filesToTranslate = [
    { path: "./documents/doc1.txt", name: "document1" },
    { path: "./documents/doc2.txt", name: "document2" },
    { path: "./documents/doc3.txt", name: "document3" },
  ];

  for (const file of filesToTranslate) {
    try {
      // Read file content
      const fs = await import("fs");
      const content = fs.readFileSync(file.path, "utf8");

      console.log(`Translating ${file.name}...`);

      // Translate content
      const result = await translate(content, "French", {
        outputDir: `./batch-translations/${file.name}`,
        verbose: false,
      });

      // Save result
      fs.writeFileSync(`./batch-translations/${file.name}-French.txt`, result);
      console.log(`✅ ${file.name} translated successfully`);
    } catch (error) {
      console.error(`❌ Failed to translate ${file.name}:`, error);
    }
  }
}

// Uncomment the function you want to run
// basicTranslation();
// advancedTranslation();
// workflowTranslation();
// batchTranslation();
