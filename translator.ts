import * as fs from "fs";
import * as path from "path";
import { OpenAI } from "openai";
import { Command } from "commander";
import * as dotenv from "dotenv";
import chalk from "chalk";
import ora from "ora";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import Anthropic from "@anthropic-ai/sdk";

// Load environment variables
dotenv.config();

// Define pricing data (cost per million tokens)
const pricingData: Map<
  string,
  { inputCostPerMillion: number; outputCostPerMillion: number }
> = new Map([
  // OpenAI Models (Source: User provided pricing page snapshot, ~2024-12-17 dates)
  // Note: Prices might change, verify with official OpenAI documentation.
  ["gpt-4o", { inputCostPerMillion: 2.5, outputCostPerMillion: 10.0 }], // Assuming gpt-4o-2024-08-06
  ["gpt-4o-mini", { inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 }], // Assuming gpt-4o-mini-2024-07-18
  ["o1", { inputCostPerMillion: 15.0, outputCostPerMillion: 60.0 }], // Assuming o1-2024-12-17 (Reasoning tokens billed as output)
  ["o3-mini", { inputCostPerMillion: 1.1, outputCostPerMillion: 4.4 }], // Assuming o3-mini-2025-01-31 (Reasoning tokens billed as output)
  // Add other specific versions if needed, e.g., gpt-4o-2024-08-06
  [
    "gpt-4o-2024-08-06",
    { inputCostPerMillion: 2.5, outputCostPerMillion: 10.0 },
  ],
  [
    "gpt-4o-mini-2024-07-18",
    { inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
  ],
  [
    "gpt-4.5-preview",
    { inputCostPerMillion: 75.0, outputCostPerMillion: 150.0 },
  ],
  // Anthropic Models (Updated based on user input for 3.7 Sonnet)
  [
    "claude-3-opus-20240229",
    { inputCostPerMillion: 15.0, outputCostPerMillion: 75.0 },
  ],
  [
    "claude-3-sonnet-20240229",
    { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
  ], // Older Sonnet
  [
    "claude-3-haiku-20240307",
    { inputCostPerMillion: 0.25, outputCostPerMillion: 1.25 },
  ],
  [
    "claude-3-5-sonnet-20240620",
    { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
  ], // Older Sonnet 3.5
  [
    "claude-3-7-sonnet-latest",
    { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
  ], // User specified
]);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Anthropic client if API key is available
let anthropic: Anthropic | null = null;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  } catch (error) {
    console.warn(
      chalk.yellow(
        "⚠️ Failed to initialize Anthropic client. Will use OpenAI for external reflection."
      )
    );
    anthropic = null;
  }
}

// Define types
interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TranslationConfig {
  sourceLanguage?: string; // Made optional
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
  originalFilename: string; // Added for final output filename
  originalExtension: string; // Added for final output filename
  inputPath: string; // Added for convenience
}

interface TranslationMetrics {
  sourceWordCount: number;
  targetWordCount: number;
  sourceCharCount: number;
  targetCharCount: number;
  ratio: number;
  estimatedReadingTime: number;
}

// Translation workflow class
class TranslationWorkflow {
  private conversation: ConversationMessage[] = [];
  private config: TranslationConfig;
  private intermediatesDir: string; // Path to intermediates folder
  private spinner = ora();
  private totalTokens = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private estimatedCost = 0;
  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
  });
  private xmlBuilder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    preserveOrder: true,
  });
  private translationSteps: string[] = [];
  private outputFiles: { [key: string]: string } = {}; // Paths will be inside intermediatesDir
  private stepCounter = 0;
  private conversationJsonPath: string; // Path inside intermediatesDir
  private conversationTextPath: string; // Path inside intermediatesDir
  private metricsPath: string; // Path inside intermediatesDir
  private sourceMetrics: TranslationMetrics;
  private translationMetrics: Map<string, TranslationMetrics> = new Map();
  private finalOutputPath: string; // Path for the final {name}-{lang}.ext file

  constructor(config: TranslationConfig) {
    this.config = config;
    let resumed = false; // Flag to indicate if we resumed from a previous state

    // Define intermediates directory path
    this.intermediatesDir = path.join(
      this.config.outputDir,
      ".translation-intermediates"
    );

    // Define final output path
    this.finalOutputPath = path.join(
      this.config.outputDir,
      `${this.config.originalFilename}-${this.config.targetLanguage}${this.config.originalExtension}`
    );

    // Create output and intermediates directories if they don't exist
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
    if (!fs.existsSync(this.intermediatesDir)) {
      fs.mkdirSync(this.intermediatesDir, { recursive: true });
    }

    // Set paths for conversation and metrics files inside intermediates folder
    this.conversationJsonPath = path.join(
      this.intermediatesDir,
      "conversation_history.json"
    );
    this.conversationTextPath = path.join(
      this.intermediatesDir,
      "conversation_history.txt"
    );
    this.metricsPath = path.join(
      this.intermediatesDir,
      "translation_metrics.json"
    );

    // Check for existing conversation history in intermediates to resume
    if (fs.existsSync(this.conversationJsonPath)) {
      try {
        const historyContent = fs.readFileSync(
          this.conversationJsonPath,
          "utf-8"
        );
        const historyData = JSON.parse(historyContent);

        if (historyData.conversation && historyData.metadata) {
          this.conversation = historyData.conversation;
          this.totalTokens = historyData.metadata.totalTokens || 0; // Load old total for potential backward compat
          this.stepCounter = historyData.metadata.step || 0;
          const lastLabel = historyData.metadata.label || "Unknown Step";

          // Load cost tracking data if available
          this.totalInputTokens = historyData.metadata.totalInputTokens || 0;
          this.totalOutputTokens = historyData.metadata.totalOutputTokens || 0;
          this.estimatedCost = historyData.metadata.estimatedCost || 0;

          // Scan intermediates directory for existing step files and populate outputFiles
          const files = fs.readdirSync(this.intermediatesDir);
          files.forEach((file) => {
            if (/^\d{2}_.*\.txt$/.test(file)) {
              // Match NN_*.txt files
              // Try to determine the step name from the filename (e.g., 01_initial_analysis -> Initial Analysis)
              const stepKey = file
                .substring(3, file.length - 4)
                .replace(/_/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase());
              this.outputFiles[stepKey] = path.join(
                this.intermediatesDir,
                file
              );
            }
          });

          // Reconstruct translationSteps based on found files (or stepCounter)
          const stepNames = [
            "Initial Analysis",
            "Expression Exploration",
            "Cultural Adaptation Discussion",
            "Title & Inspiration Exploration",
            "First Translation",
            "Self-Critique & First Refinement", // Combined step name for history
            "Second Refinement", // Combined step name for history
            "Final Translation", // Primary outcome step name for history
            "External Review",
            "Final Refinement",
          ];
          // More robust reconstruction based on the keys found in outputFiles map might be better
          this.translationSteps = Object.keys(this.outputFiles)
            .map((key) => parseInt(key.substring(0, 2))) // Get step number prefix
            .sort((a, b) => a - b) // Sort by step number
            .map((num) => stepNames[num - 1]) // Map back to names (approximate)
            .filter((name): name is string => !!name); // Filter out undefined

          // Load existing metrics
          if (fs.existsSync(this.metricsPath)) {
            const metricsContent = fs.readFileSync(this.metricsPath, "utf-8");
            const metricsData = JSON.parse(metricsContent);
            this.sourceMetrics =
              metricsData.source ||
              this.calculateMetrics(this.config.sourceText, true);
            Object.entries(metricsData).forEach(([key, value]) => {
              if (key !== "source") {
                this.translationMetrics.set(key, value as TranslationMetrics);
              }
            });
          } else {
            // Calculate source metrics if metrics file doesn't exist
            this.sourceMetrics = this.calculateMetrics(
              this.config.sourceText,
              true
            );
          }

          console.log(
            chalk.yellow(
              `🔄 Resuming translation workflow from step ${this.stepCounter} (${lastLabel})`
            )
          );
          resumed = true;
        } else {
          // Invalid history file, initialize normally
          this.initializeNewConversation();
        }
      } catch (error) {
        console.error(
          chalk.red(
            "❌ Error reading or parsing conversation history file. Starting fresh."
          ),
          error
        );
        this.initializeNewConversation();
      }
    } else {
      // No history file, initialize normally
      this.initializeNewConversation();
    }

    // If we didn't resume, save the initial state
    if (!resumed) {
      this.saveConversationHistory("Initial system prompt");
    }
  }

  // Helper function to initialize a new conversation state
  private initializeNewConversation(): void {
    this.sourceMetrics = this.calculateMetrics(this.config.sourceText, true);
    this.conversation = []; // Reset conversation
    this.totalTokens = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.estimatedCost = 0;
    this.stepCounter = 0;
    this.translationSteps = [];
    this.translationMetrics = new Map();
    this.outputFiles = {};

    // Build system prompt
    let systemPrompt = `You are an expert literary translator with deep fluency in ${
      this.config.targetLanguage
    }${this.config.sourceLanguage ? ` and ${this.config.sourceLanguage}` : ""}.
    Your goal is to create a high-quality translation that preserves the original's tone, style, literary devices,
    cultural nuances, and overall impact. You prioritize readability and naturalness in the target language while
    staying faithful to the source text's meaning and intention${
      this.config.sourceLanguage
        ? ""
        : " (you may need to infer the source language from the text provided)"
    }.

    Always place your translations inside appropriate XML tags for easy extraction:
    - Initial analysis: <analysis>your analysis here</analysis>
    - Expression exploration: <expression_exploration>your exploration here</expression_exploration>
    - Cultural discussion: <cultural_discussion>your discussion here</cultural_discussion>
    - Title options: <title_options>your title suggestions here</title_options>
    - First draft translation: <first_translation>your translation here</first_translation>
    - Critique: <critique>your critique here</critique>
    - Improved translation: <improved_translation>your improved translation here</improved_translation>
    - Second critique: <second_critique>your second critique here</second_critique>
    - Further improved translation: <further_improved_translation>your further improved translation here</further_improved_translation>
    - Comprehensive review: <review>your comprehensive review here</review>
    - Final translation: <final_translation>your final translation here</final_translation>
    - External review: <external_review>your external review here</external_review>
    - Refined final translation: <refined_final_translation>your refined final translation here</refined_final_translation>

    Your tone should be conversational and thoughtful, as if you're discussing the translation process with a colleague.
    Think deeply about cultural context, idiomatic expressions, and literary devices that would resonate with native
    ${this.config.targetLanguage} speakers.

    Work through the translation step by step, maintaining the voice and essence of the original while making it
    feel naturally written in ${this.config.targetLanguage}.

    Your output length is unlocked so you can do at least 10K tokens in the output.`;

    if (this.config.customInstructions) {
      systemPrompt += `\n\nAdditional instructions for this translation:\n${this.config.customInstructions}`;
    }

    this.conversation.push({
      role: "system",
      content: systemPrompt,
    });
  }

  // Main execution method
  public async execute(): Promise<void> {
    this.logHeader("Starting Translation Workflow");
    this.log(
      chalk.blue(
        `📄 Translating ${
          this.config.sourceLanguage
            ? `from ${this.config.sourceLanguage} `
            : ""
        }to ${this.config.targetLanguage}`
      )
    );
    this.log(chalk.blue(`   Input file: ${this.config.inputPath}`));
    this.log(chalk.blue(`   Output file: ${this.finalOutputPath}`));
    this.log(chalk.blue(`   Intermediates: ${this.intermediatesDir}`));
    this.displaySourceMetrics();

    const startTime = Date.now();
    let latestTranslationContent = ""; // Track the latest completed translation text

    try {
      // Step 1: Initial analysis
      await this.initialAnalysis();

      // Step 2: Exploring expression
      await this.expressionExploration();

      // Step 3: Tone and cultural discussion
      await this.toneAndCulturalDiscussion();

      // Step 4: Title and inspiration
      await this.titleAndInspirationExploration();

      // Step 5: First translation
      latestTranslationContent = await this.firstTranslationAttempt();

      // Step 6: Self-critique & first refinement
      latestTranslationContent = await this.selfCritiqueAndRefinement(
        latestTranslationContent
      );

      // Step 7: Second refinement
      latestTranslationContent = await this.furtherRefinement(
        latestTranslationContent
      );

      // Step 8: Final translation & review
      latestTranslationContent = await this.finalTranslation(
        latestTranslationContent
      );

      // Step 9: External review (conditionally calls step 10)
      if (!this.config.skipExternalReview) {
        // applyExternalFeedback is called internally if review succeeds
        // We need the potentially refined content from it
        const refinedContent = await this.getExternalReview(
          latestTranslationContent
        );
        if (refinedContent !== null) {
          // Check if refinement happened
          latestTranslationContent = refinedContent;
        }
      }

      // Save metrics (now happens within steps or here)
      this.saveTranslationMetrics();

      // Save the final translation (successful run)
      fs.writeFileSync(this.finalOutputPath, latestTranslationContent);
      this.log(
        chalk.green(`✅ Final translation saved to: ${this.finalOutputPath}`)
      );

      // Record and display completion metrics
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // in seconds

      this.logHeader("Translation Complete");
      this.log(
        chalk.green(
          `✅ Translation successfully completed in ${this.formatDuration(
            duration
          )}`
        )
      );
      this.log(
        chalk.cyan(`   Input tokens: ${this.totalInputTokens.toLocaleString()}`)
      );
      this.log(
        chalk.cyan(
          `   Output tokens: ${this.totalOutputTokens.toLocaleString()}`
        )
      );
      this.log(
        chalk.yellow(
          `💲 Estimated total cost: $${this.estimatedCost.toFixed(4)}`
        )
      );
      this.log(
        chalk.green(`📁 Intermediate files saved to: ${this.intermediatesDir}`)
      );
      this.log(
        chalk.green(`📄 Final output saved to: ${this.finalOutputPath}`)
      );

      // Display all intermediate output files
      this.log(chalk.magenta("\n📋 Generated Intermediate Files:"));
      Object.entries(this.outputFiles).forEach(([key, filePath]) => {
        // Display relative path from outputDir for clarity
        const relativePath = path.relative(this.config.outputDir, filePath);
        this.log(chalk.cyan(`   ${key}: ${relativePath}`));
      });

      // Display translation journey metrics
      this.displayTranslationJourney();
    } catch (error) {
      // Let the main catch block handle this after saving latest translation
      throw error; // Re-throw for the main handler
    }
  }

  // Step 1: Initial analysis
  private async initialAnalysis(): Promise<void> {
    const outputPath = path.join(
      this.intermediatesDir,
      "01_initial_analysis.txt"
    );
    const stepKey = "01 Initial Analysis";

    if (fs.existsSync(outputPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 1 (${stepKey}): Output file already exists.`
        )
      );
      if (!this.outputFiles[stepKey]) this.outputFiles[stepKey] = outputPath;
      return;
    }

    this.stepCounter++; // Increment counter only if step runs
    this.translationSteps.push(stepKey);
    this.spinner.start(
      chalk.blue(`📊 Step ${this.stepCounter}: Analyzing source text`)
    );

    const prompt = `I'd like your help translating a text into ${
      this.config.targetLanguage
    }${this.config.sourceLanguage ? ` from ${this.config.sourceLanguage}` : ""}.
Before we start, could you analyze what we'll need to preserve in terms of tone, style, meaning, and cultural nuances?

Here's the text:

${this.config.sourceText}

Please analyze this text thoughtfully. What are the key elements that make this text distinctive? What tone, voice,
argument structure, rhetorical devices, and cultural references should we be careful to preserve in translation?

Remember to put your analysis in <analysis> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(`📊 Step ${this.stepCounter}: Initial analysis completed`)
    );

    const analysisMatch = response.match(/<analysis>([\s\S]*)<\/analysis>/);
    const analysis = analysisMatch ? analysisMatch[1].trim() : response;

    fs.writeFileSync(outputPath, analysis);
    this.outputFiles[stepKey] = outputPath;
    this.log(chalk.green("  ↪ Analysis saved to intermediates"));

    const metrics = this.calculateMetrics(analysis);
    this.translationMetrics.set("analysis", metrics);
    this.displayMetrics(stepKey, metrics);
  }

  // Step 2: Exploring expression in target language
  private async expressionExploration(): Promise<void> {
    const outputPath = path.join(
      this.intermediatesDir,
      "02_expression_exploration.txt"
    );
    const stepKey = "02 Expression Exploration";

    if (fs.existsSync(outputPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 2 (${stepKey}): Output file already exists.`
        )
      );
      if (!this.outputFiles[stepKey]) this.outputFiles[stepKey] = outputPath;
      return;
    }

    this.stepCounter++;
    this.translationSteps.push(stepKey);
    this.spinner.start(
      chalk.blue(
        `🔍 Step ${this.stepCounter}: Exploring expression in target language`
      )
    );

    const prompt = `Now that we've analyzed the text, I'm curious about how we could express these elements in ${
      this.config.targetLanguage
    }${
      this.config.sourceLanguage
        ? ` (considering it's from ${this.config.sourceLanguage})`
        : ""
    }.

How might we capture the tone and style of the original in ${
      this.config.targetLanguage
    }? Are there particular expressions,
idioms, or literary devices in ${
      this.config.targetLanguage
    } that could help convey the same feeling and impact?

What about cultural references or metaphors? Could you suggest some ways to handle those elements that would resonate
with ${
      this.config.targetLanguage
    } speakers while staying true to the original's intent?

I'd love some specific examples or suggestions that we could use in our translation. Please include your thoughts
in <expression_exploration> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(
        `🔍 Step ${this.stepCounter}: Expression exploration completed`
      )
    );

    const explorationMatch = response.match(
      /<expression_exploration>([\s\S]*)<\/expression_exploration>/
    );
    const exploration = explorationMatch
      ? explorationMatch[1].trim()
      : response;

    fs.writeFileSync(outputPath, exploration);
    this.outputFiles[stepKey] = outputPath;
    this.log(chalk.green("  ↪ Expression exploration saved to intermediates"));

    const metrics = this.calculateMetrics(exploration);
    this.translationMetrics.set("exploration", metrics);
    this.displayMetrics(stepKey, metrics);
  }

  // Step 3: Discussion on tone, honorifics, and cultural adaptation
  private async toneAndCulturalDiscussion(): Promise<void> {
    const outputPath = path.join(
      this.intermediatesDir,
      "03_cultural_discussion.txt"
    );
    const stepKey = "03 Cultural Adaptation Discussion";

    if (fs.existsSync(outputPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 3 (${stepKey}): Output file already exists.`
        )
      );
      if (!this.outputFiles[stepKey]) this.outputFiles[stepKey] = outputPath;
      return;
    }

    this.stepCounter++;
    this.translationSteps.push(stepKey);
    this.spinner.start(
      chalk.blue(
        `🏮 Step ${this.stepCounter}: Discussing cultural adaptation and tone`
      )
    );

    const prompt = `Let's discuss some specific aspects of our translation approach for translating into ${
      this.config.targetLanguage
    }${this.config.sourceLanguage ? ` from ${this.config.sourceLanguage}` : ""}:

What do you think would be the most appropriate tone or level of honorifics to use in this ${
      this.config.targetLanguage
    } translation?
I understand there might be cultural differences to consider. What would feel most natural and appropriate given the content and style of the original?

Are there any cultural references or allegories in ${
      this.config.targetLanguage
    } that might help convey the essence of certain passages,
even if they slightly modify the literal meaning? I'm fine with creative adaptation as long as the core message is preserved.

How can we ensure the translation maintains a distinctive personal voice, rather than sounding generic?
What would you say is unique about the original's voice, and how could we capture that in ${
      this.config.targetLanguage
    }?

Please share your thoughts in <cultural_discussion> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(
        `🏮 Step ${this.stepCounter}: Cultural adaptation discussion completed`
      )
    );

    const discussionMatch = response.match(
      /<cultural_discussion>([\s\S]*)<\/cultural_discussion>/
    );
    const discussion = discussionMatch ? discussionMatch[1].trim() : response;

    fs.writeFileSync(outputPath, discussion);
    this.outputFiles[stepKey] = outputPath;
    this.log(
      chalk.green("  ↪ Cultural adaptation discussion saved to intermediates")
    );

    const metrics = this.calculateMetrics(discussion);
    this.translationMetrics.set("cultural_discussion", metrics);
    this.displayMetrics(stepKey, metrics);
  }

  // Step 4: Title translation and literary inspiration
  private async titleAndInspirationExploration(): Promise<void> {
    const outputPath = path.join(this.intermediatesDir, "04_title_options.txt");
    const stepKey = "04 Title & Inspiration Exploration";

    if (fs.existsSync(outputPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 4 (${stepKey}): Output file already exists.`
        )
      );
      if (!this.outputFiles[stepKey]) this.outputFiles[stepKey] = outputPath;
      return;
    }

    this.stepCounter++;
    this.translationSteps.push(stepKey);
    this.spinner.start(
      chalk.blue(
        `✨ Step ${this.stepCounter}: Exploring title translation and literary inspiration`
      )
    );

    const prompt = `Let's talk about a few more aspects before we start the actual translation into ${
      this.config.targetLanguage
    }${this.config.sourceLanguage ? ` from ${this.config.sourceLanguage}` : ""}:

What might be a good way to translate the title into ${
      this.config.targetLanguage
    }? Could you suggest a few options
that would capture the essence and appeal while being culturally appropriate?

Are there any ${
      this.config.targetLanguage
    } writers or texts with a similar style or thematic focus that might
serve as inspiration for our translation approach? I'd find it helpful to know if this reminds you of particular writers or works.

What common pitfalls should we be careful to avoid when translating this type of content from ${
      this.config.sourceLanguage
    }
to ${
      this.config.targetLanguage
    }? Any particular challenges or mistakes that translators often make?

Please share your thoughts in <title_options> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(
        `✨ Step ${this.stepCounter}: Title and inspiration exploration completed`
      )
    );

    const optionsMatch = response.match(
      /<title_options>([\s\S]*)<\/title_options>/
    );
    const options = optionsMatch ? optionsMatch[1].trim() : response;

    fs.writeFileSync(outputPath, options);
    this.outputFiles[stepKey] = outputPath;
    this.log(
      chalk.green("  ↪ Title options and inspiration saved to intermediates")
    );

    const metrics = this.calculateMetrics(options);
    this.translationMetrics.set("title_options", metrics);
    this.displayMetrics(stepKey, metrics);
  }

  // Step 5: First translation attempt
  private async firstTranslationAttempt(): Promise<string> {
    const outputPath = path.join(
      this.intermediatesDir,
      "05_first_translation.txt"
    );
    const stepKey = "05 First Translation";

    if (fs.existsSync(outputPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 5 (${stepKey}): Output file already exists.`
        )
      );
      if (!this.outputFiles[stepKey]) this.outputFiles[stepKey] = outputPath;
      return fs.readFileSync(outputPath, "utf-8");
    }

    this.stepCounter++;
    this.translationSteps.push(stepKey);
    this.spinner.start(
      chalk.blue(
        `📝 Step ${this.stepCounter}: Creating first draft translation`
      )
    );

    const prompt = `I think we're ready to start translating! Based on our discussions so far, could you create
a first draft translation of the text into ${this.config.targetLanguage}${
      this.config.sourceLanguage
        ? ` (from the original ${this.config.sourceLanguage})`
        : ""
    }?

Here's the original text again for reference:

${this.config.sourceText}

Please apply all the insights we've discussed about tone, style, cultural adaptation, and voice.
Please ensure the entire text is translated in this draft to facilitate review and usability.
Remember to put your translation in <first_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(
        `📝 Step ${this.stepCounter}: First draft translation completed`
      )
    );

    const translationMatch = response.match(
      /<first_translation>([\s\S]*)<\/first_translation>/
    );
    const firstTranslation = translationMatch
      ? translationMatch[1].trim()
      : response;

    fs.writeFileSync(outputPath, firstTranslation);
    this.outputFiles[stepKey] = outputPath;
    this.log(chalk.green("  ↪ First draft translation saved to intermediates"));

    const metrics = this.calculateMetrics(firstTranslation);
    this.translationMetrics.set("first_translation", metrics);
    this.displayMetrics(stepKey, metrics);

    return firstTranslation;
  }

  // Step 6: Self-critique and first refinement
  private async selfCritiqueAndRefinement(
    previousTranslation: string
  ): Promise<string> {
    const critiquePath = path.join(
      this.intermediatesDir,
      "06_first_critique.txt"
    );
    const improvedPath = path.join(
      this.intermediatesDir,
      "07_improved_translation.txt"
    );
    const stepKeyCritique = "06 First Critique";
    const stepKeyImproved = "07 Improved Translation";
    const combinedStepName = "Self-Critique & First Refinement";

    if (fs.existsSync(improvedPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 6 (${combinedStepName}): Output file ${path.basename(
            improvedPath
          )} already exists.`
        )
      );
      if (!this.outputFiles[stepKeyCritique] && fs.existsSync(critiquePath))
        this.outputFiles[stepKeyCritique] = critiquePath;
      if (!this.outputFiles[stepKeyImproved])
        this.outputFiles[stepKeyImproved] = improvedPath;
      return fs.readFileSync(improvedPath, "utf-8");
    }

    this.stepCounter++;
    this.translationSteps.push(combinedStepName);
    this.spinner.start(
      chalk.blue(
        `🔄 Step ${this.stepCounter}: Performing self-critique and first refinement`
      )
    );

    const prompt = `Now that we have our first draft, I'd love for you to review it critically.
What do you think are the strengths and weaknesses of this translation?

Could you analyze aspects like:
- Sentence structure and flow
- Word choice and terminology
- How well cultural elements were adapted
- The preservation of the original's tone and voice
- Poetic quality and literary devices
- Overall readability and naturalness in ${this.config.targetLanguage}

After providing your critique, please offer an improved version of the translation that addresses
the issues you identified. Providing the complete improved translation allows for easier comparison and usability.

Here is the translation to critique and improve:

${previousTranslation}

Please put your critique in <critique> tags and your complete improved translation in <improved_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(
        `🔄 Step ${this.stepCounter}: Self-critique and first refinement completed`
      )
    );

    const critiqueMatch = response.match(/<critique>([\s\S]*)<\/critique>/);
    const critique = critiqueMatch ? critiqueMatch[1].trim() : "";

    const improvedMatch = response.match(
      /<improved_translation>([\s\S]*)<\/improved_translation>/
    );
    const improvedTranslation = improvedMatch
      ? improvedMatch[1].trim()
      : response;

    fs.writeFileSync(critiquePath, critique);
    this.outputFiles[stepKeyCritique] = critiquePath;

    fs.writeFileSync(improvedPath, improvedTranslation);
    this.outputFiles[stepKeyImproved] = improvedPath;

    this.log(
      chalk.green(
        "  ↪ Critique and improved translation saved to intermediates"
      )
    );

    const critiqueMetrics = this.calculateMetrics(critique);
    this.translationMetrics.set("first_critique", critiqueMetrics);
    this.displayMetrics(stepKeyCritique, critiqueMetrics);

    const improvedMetrics = this.calculateMetrics(improvedTranslation);
    this.translationMetrics.set("improved_translation", improvedMetrics);
    this.displayMetrics(stepKeyImproved, improvedMetrics);

    return improvedTranslation;
  }

  // Step 7: Further review and second refinement
  private async furtherRefinement(
    previousTranslation: string
  ): Promise<string> {
    const critiquePath = path.join(
      this.intermediatesDir,
      "08_second_critique.txt"
    );
    const furtherImprovedPath = path.join(
      this.intermediatesDir,
      "09_further_improved_translation.txt"
    );
    const stepKeyCritique = "08 Second Critique";
    const stepKeyImproved = "09 Further Improved Translation";
    const combinedStepName = "Second Refinement";

    if (fs.existsSync(furtherImprovedPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 7 (${combinedStepName}): Output file ${path.basename(
            furtherImprovedPath
          )} already exists.`
        )
      );
      if (!this.outputFiles[stepKeyCritique] && fs.existsSync(critiquePath))
        this.outputFiles[stepKeyCritique] = critiquePath;
      if (!this.outputFiles[stepKeyImproved])
        this.outputFiles[stepKeyImproved] = furtherImprovedPath;
      return fs.readFileSync(furtherImprovedPath, "utf-8");
    }

    this.stepCounter++;
    this.translationSteps.push(combinedStepName);
    this.spinner.start(
      chalk.blue(
        `🔄 Step ${this.stepCounter}: Performing second round of refinement`
      )
    );

    const prompt = `As you mentioned before, the best way to write is often through critique and rewrite.
With fresh eyes, could you take another look at our current translation?

What aspects still need improvement? Are there places where the language could be more natural,
the cultural adaptation more nuanced, or the translation more faithful to the original's spirit?

I find that each revision helps us discover new things and see the text from different angles.
Your insights on what could still be enhanced would be invaluable.

After your critique, please provide another refined version of the translation that incorporates
these new insights and improvements. Please provide the complete refined translation for review.

Here is the translation to critique and improve:

${previousTranslation}

Please put your second critique in <second_critique> tags and your complete further improved translation
in <further_improved_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(
        `🔄 Step ${this.stepCounter}: Second round of refinement completed`
      )
    );

    const critiqueMatch = response.match(
      /<second_critique>([\s\S]*)<\/second_critique>/
    );
    const critique = critiqueMatch ? critiqueMatch[1].trim() : "";

    const furtherImprovedMatch = response.match(
      /<further_improved_translation>([\s\S]*)<\/further_improved_translation>/
    );
    const furtherImprovedTranslation = furtherImprovedMatch
      ? furtherImprovedMatch[1].trim()
      : response;

    fs.writeFileSync(critiquePath, critique);
    this.outputFiles[stepKeyCritique] = critiquePath;

    fs.writeFileSync(furtherImprovedPath, furtherImprovedTranslation);
    this.outputFiles[stepKeyImproved] = furtherImprovedPath;

    this.log(
      chalk.green(
        "  ↪ Second critique and further improved translation saved to intermediates"
      )
    );

    const critiqueMetrics = this.calculateMetrics(critique);
    this.translationMetrics.set("second_critique", critiqueMetrics);
    this.displayMetrics(stepKeyCritique, critiqueMetrics);

    const furtherImprovedMetrics = this.calculateMetrics(
      furtherImprovedTranslation
    );
    this.translationMetrics.set(
      "further_improved_translation",
      furtherImprovedMetrics
    );
    this.displayMetrics(stepKeyImproved, furtherImprovedMetrics);

    return furtherImprovedTranslation;
  }

  // Step 8: Final translation with comprehensive review
  private async finalTranslation(previousTranslation: string): Promise<string> {
    const reviewPath = path.join(
      this.intermediatesDir,
      "10_comprehensive_review.txt"
    );
    const finalTranslationPath = path.join(
      this.intermediatesDir,
      "11_final_translation.txt"
    );
    const stepKeyReview = "10 Comprehensive Review";
    const stepKeyFinal = "11 Final Translation";
    const combinedStepName = "Final Translation & Review";

    if (fs.existsSync(finalTranslationPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 8 (${combinedStepName}): Output file ${path.basename(
            finalTranslationPath
          )} already exists.`
        )
      );
      if (!this.outputFiles[stepKeyReview] && fs.existsSync(reviewPath))
        this.outputFiles[stepKeyReview] = reviewPath;
      if (!this.outputFiles[stepKeyFinal])
        this.outputFiles[stepKeyFinal] = finalTranslationPath;
      return fs.readFileSync(finalTranslationPath, "utf-8");
    }

    this.stepCounter++;
    this.translationSteps.push(combinedStepName);
    this.spinner.start(
      chalk.blue(
        `🏁 Step ${this.stepCounter}: Creating final translation with comprehensive review`
      )
    );

    const prompt = `We've gone through several rounds of refinement, and I'm very happy with how the translation has evolved.
As a final step, I'd like you to provide:

1. A comprehensive review of the translation process, including:
   - A thoughtful comparison between the original ${this.config.sourceLanguage} text and our ${this.config.targetLanguage} translation
   - An analysis of the translation as a standalone piece of ${this.config.targetLanguage} writing
   - Reflections on how well we preserved the key elements we identified at the beginning

2. A final, polished version of the translation that represents your best work, incorporating all our discussions
and refinements throughout this process.

This final version should be something we can be proud of - a translation that's faithful to the original while
also reading naturally and beautifully in ${this.config.targetLanguage}. Please provide the entire final translation.

Here is the translation to review and finalize:

${previousTranslation}

Please put your review in <review> tags and your complete final translation in <final_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(`🏁 Step ${this.stepCounter}: Final translation completed`)
    );

    const reviewMatch = response.match(/<review>([\s\S]*)<\/review>/);
    const review = reviewMatch ? reviewMatch[1].trim() : "";

    const finalTranslationMatch = response.match(
      /<final_translation>([\s\S]*)<\/final_translation>/
    );
    const finalTranslation = finalTranslationMatch
      ? finalTranslationMatch[1].trim()
      : response;

    fs.writeFileSync(reviewPath, review);
    this.outputFiles[stepKeyReview] = reviewPath;

    fs.writeFileSync(finalTranslationPath, finalTranslation);
    this.outputFiles[stepKeyFinal] = finalTranslationPath;

    this.log(
      chalk.green(
        "  ↪ Comprehensive review and final translation saved to intermediates"
      )
    );

    const reviewMetrics = this.calculateMetrics(review);
    this.translationMetrics.set("review", reviewMetrics);
    this.displayMetrics(stepKeyReview, reviewMetrics);

    const finalMetrics = this.calculateMetrics(finalTranslation);
    this.translationMetrics.set("final_translation", finalMetrics);
    this.displayMetrics(stepKeyFinal, finalMetrics);
    this.displayComparisonWithSource(finalMetrics);

    return finalTranslation;
  }

  // Step 9: External review using Anthropic Claude or OpenAI
  // Returns the refined translation content if refinement occurred, otherwise null
  private async getExternalReview(
    finalTranslation: string
  ): Promise<string | null> {
    const externalReviewPath = path.join(
      this.intermediatesDir,
      "12_external_review.txt"
    );
    const stepKey = "12 External Review";
    const anthropicModel = "claude-3-7-sonnet-latest"; // Use latest Sonnet model
    let externalReview = "";
    let reviewObtained = false;
    let refinedTranslation: string | null = null; // Store potential refinement

    if (fs.existsSync(externalReviewPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 9 (${stepKey}): Output file already exists.`
        )
      );
      if (!this.outputFiles[stepKey])
        this.outputFiles[stepKey] = externalReviewPath;
      externalReview = fs.readFileSync(externalReviewPath, "utf-8");
      reviewObtained = true;
      // Proceed to apply feedback even if review was loaded from file
    } else {
      this.stepCounter++;
      this.translationSteps.push(stepKey);
      this.spinner.start(
        chalk.blue(`🔍 Step ${this.stepCounter}: Getting external review`)
      );

      try {
        if (anthropic) {
          this.spinner.text = chalk.blue(
            `🔍 Step ${this.stepCounter}: Getting external review from Claude 3.7 Sonnet (Latest)`
          );
          this.log(chalk.dim(`  🧠 Enabling Extended Thinking/Output (Beta)`));
          const response = await anthropic.beta.messages.create({
            model: anthropicModel,
            max_tokens: 100000, // Increase for extended output/thinking
            temperature: 1,
            thinking: {
              type: "enabled",
              budget_tokens: 32000, // Allocate budget for thinking (example value)
            },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `<Original>
${this.config.sourceText}
</Original>

<Translation>
${finalTranslation}
</Translation>

Here is an original ${this.config.sourceLanguage} article and a ${this.config.targetLanguage} translation. Compare and critique the translation in terms of how well it captures the soul of the original and the dialectic, but also how it stands alone as a piece of writing. Provide actionable feedback, with possible inspiration from good ${this.config.targetLanguage} writers or pieces.

Please format your response in <external_review> tags.`,
                  },
                ],
              },
            ],
            betas: ["output-128k-2025-02-19"], // Enable extended output beta
          });

          if (response.content[0]?.type === "text") {
            externalReview = response.content[0].text;
          } else {
            console.warn(
              chalk.yellow(
                "⚠️ Anthropic response did not contain text in the expected format."
              )
            );
            externalReview = ""; // Default to empty if unexpected format
          }

          // Update Anthropic tokens and cost
          const inputTokens = response.usage?.input_tokens || 0;
          const outputTokens = response.usage?.output_tokens || 0;
          this.totalInputTokens += inputTokens;
          this.totalOutputTokens += outputTokens;
          this.updateCost(anthropicModel, inputTokens, outputTokens);
        } else {
          this.spinner.text = chalk.blue(
            `🔍 Step ${this.stepCounter}: Getting external review from OpenAI (Claude not available)`
          );
          const prompt = `<Original>
${this.config.sourceText}
</Original>

<Translation>
${finalTranslation}
</Translation>

Here is an original ${this.config.sourceLanguage} article and a ${this.config.targetLanguage} translation. Compare and critique the translation in terms of how well it captures the soul of the original and the dialectic, but also how it stands alone as a piece of writing. Provide actionable feedback, with possible inspiration from good ${this.config.targetLanguage} writers or pieces.

Please format your response in <external_review> tags.`;
          const response = await this.callOpenAI(prompt, 0, true);
          const reviewMatch = response.match(
            /<external_review>([\s\S]*)<\/external_review>/
          );
          externalReview = reviewMatch ? reviewMatch[1].trim() : response;
        }

        this.spinner.succeed(
          chalk.green(`🔍 Step ${this.stepCounter}: External review completed`)
        );

        fs.writeFileSync(externalReviewPath, externalReview);
        this.outputFiles[stepKey] = externalReviewPath;
        this.log(chalk.green("  ↪ External review saved to intermediates"));

        const reviewMetrics = this.calculateMetrics(externalReview);
        this.translationMetrics.set("external_review", reviewMetrics);
        this.displayMetrics(stepKey, reviewMetrics);
        reviewObtained = true;
      } catch (error: any) {
        this.spinner.warn(
          chalk.yellow(
            `⚠️ External review failed: ${
              error?.message || error
            }. Continuing without it.`
          )
        );
        this.log(chalk.yellow("  ↪ Skipping external review due to error"));
        reviewObtained = false;
        return null; // Exit early if review fails
      }
    }

    // Only apply feedback if a review was successfully obtained or loaded
    if (reviewObtained && externalReview.trim()) {
      refinedTranslation = await this.applyExternalFeedback(
        finalTranslation,
        externalReview
      );
    } else if (reviewObtained && !externalReview.trim()) {
      this.log(
        chalk.yellow(
          "  ↪ Skipping refinement: Loaded external review file is empty."
        )
      );
    }

    return refinedTranslation; // Return refined content or null
  }

  // Apply external feedback to get a refined final translation
  // Returns the refined translation content
  private async applyExternalFeedback(
    finalTranslation: string,
    externalReview: string
  ): Promise<string> {
    const refinedFinalPath = path.join(
      this.intermediatesDir,
      "13_refined_final_translation.txt"
    );
    const stepKey = "13 Final Refinement";
    const outputKey = "Refined Final Translation";

    if (fs.existsSync(refinedFinalPath)) {
      this.log(
        chalk.yellow(
          `🔄 Skipping Step 10 (${stepKey}): Output file ${path.basename(
            refinedFinalPath
          )} already exists.`
        )
      );
      if (!this.outputFiles[outputKey])
        this.outputFiles[outputKey] = refinedFinalPath;
      return fs.readFileSync(refinedFinalPath, "utf-8");
    }

    this.stepCounter++;
    this.translationSteps.push(stepKey);
    this.spinner.start(
      chalk.blue(
        `✨ Step ${this.stepCounter}: Applying external feedback for final refinement`
      )
    );

    const prompt = `We received an external review of our translation. Here it is:

${externalReview}

Based on this feedback, please create a final, refined version of the translation that addresses
the points raised in the review. This will be our absolute final version. Please provide the complete translation.

Here's the current translation for reference:

${finalTranslation}

Please put your refined translation in <refined_final_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green(`✨ Step ${this.stepCounter}: Final refinement completed`)
    );

    const refinedFinalMatch = response.match(
      /<refined_final_translation>([\s\S]*)<\/refined_final_translation>/
    );
    const refinedFinalTranslation = refinedFinalMatch
      ? refinedFinalMatch[1].trim()
      : response;

    fs.writeFileSync(refinedFinalPath, refinedFinalTranslation);
    this.outputFiles[outputKey] = refinedFinalPath;
    this.log(
      chalk.green("  ↪ Refined final translation saved to intermediates")
    );

    const refinedFinalMetrics = this.calculateMetrics(refinedFinalTranslation);
    this.translationMetrics.set(
      "refined_final_translation",
      refinedFinalMetrics
    );
    this.displayMetrics(stepKey, refinedFinalMetrics);
    this.displayComparisonWithSource(refinedFinalMetrics);

    return refinedFinalTranslation;
  }

  // Helper method to call OpenAI API
  private async callOpenAI(
    prompt: string,
    retryCount = 0,
    isExternalReview = false
  ): Promise<string> {
    // Declare currentStepLabel here and initialize with a default value
    let currentStepLabel: string = "Unknown Step (Error before assignment)";
    const modelName = this.config.modelName;
    const isReasoningModel =
      modelName.startsWith("o1") || modelName.startsWith("o3");

    try {
      // Prepare a descriptive step name for logging
      const stepName =
        this.translationSteps.length > 0
          ? this.translationSteps[this.translationSteps.length - 1]
          : "Initial Step"; // Fallback label
      currentStepLabel = isExternalReview
        ? `External Review (OpenAI)`
        : `Step ${this.stepCounter} - ${stepName}`;

      // For external review, start a fresh conversation to avoid biases
      let messages: ConversationMessage[] = [];

      if (isExternalReview) {
        // Create a new conversation for external review
        messages.push({
          role: "system",
          content: `You are an expert literary translator and critic with deep fluency in ${
            this.config.targetLanguage
          }${
            this.config.sourceLanguage
              ? ` and ${this.config.sourceLanguage}`
              : ""
          }.
Your task is to critically review a translation ${
            this.config.sourceLanguage
              ? `from ${this.config.sourceLanguage} `
              : ""
          }to ${this.config.targetLanguage}, providing detailed,
constructive feedback on how well it captures the essence, tone, and cultural nuances of the original text.
Please be candid but fair in your assessment.`,
        });
        messages.push({
          role: "user",
          content: prompt,
        });
      } else {
        // Add the prompt to the main conversation
        this.conversation.push({
          role: "user",
          content: prompt,
        });
        messages = this.conversation;
      }

      // Save conversation history before API call (only for main conversation, not external review)
      if (!isExternalReview) {
        // Use the defined currentStepLabel
        this.saveConversationHistory(currentStepLabel);
      }

      let responseContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      let startTime = 0;
      let endTime = 0;
      let duration = 0;

      // --- Call appropriate OpenAI API based on model type ---
      if (isReasoningModel) {
        // --- Use Responses API for o1/o3 models ---
        this.log(chalk.dim(`  🧠 Using Responses API for model: ${modelName}`));

        // Format input for Responses API (combine system + user prompt)
        let combinedPrompt = "";
        if (messages[0]?.role === "system") {
          combinedPrompt = messages[0].content + "\n\n---\n\n";
          combinedPrompt += messages
            .slice(1)
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n\n"); // Simple combination
        } else {
          // Fallback if no system prompt (shouldn't happen with current structure)
          combinedPrompt = messages
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n\n");
        }

        startTime = performance.now();
        const response = await openai.responses.create({
          model: modelName,
          input: [{ role: "user", content: combinedPrompt }],
          reasoning: { effort: this.config.reasoningEffort },
          max_output_tokens: this.config.maxOutputTokens,
        });
        endTime = performance.now();
        duration = (endTime - startTime) / 1000; // Duration in seconds
        responseContent = response.output_text || "";
        inputTokens = response.usage?.input_tokens || 0;
        outputTokens = response.usage?.output_tokens || 0; // Includes reasoning tokens

        // Check for incomplete response due to token limits
        if (
          response.status === "incomplete" &&
          response.incomplete_details?.reason === "max_output_tokens"
        ) {
          this.log(
            chalk.yellow(
              `  ⚠️ Response incomplete: Max output tokens (${this.config.maxOutputTokens}) reached.`
            )
          );
          if (!responseContent) {
            this.log(
              chalk.yellow(
                "  ⚠️ Ran out of tokens during reasoning phase (no visible output)."
              )
            );
          }
        }
      } else {
        // --- Use Chat Completions API for gpt models ---
        this.log(
          chalk.dim(`  💬 Using Chat Completions API for model: ${modelName}`)
        );
        startTime = performance.now();
        const completion = await openai.chat.completions.create({
          model: modelName,
          messages: messages,
          temperature: 0.7,
          max_tokens: this.config.maxOutputTokens, // Use the new config option here too
        });
        endTime = performance.now();
        duration = (endTime - startTime) / 1000; // Duration in seconds
        responseContent = completion.choices[0].message.content || "";
        inputTokens = completion.usage?.prompt_tokens || 0;
        outputTokens = completion.usage?.completion_tokens || 0;
      }
      // ------------------------------------------------------

      // Update token counts and cost
      this.totalInputTokens += inputTokens;
      this.totalOutputTokens += outputTokens;
      this.updateCost(modelName, inputTokens, outputTokens);

      // Log TPS if verbose
      if (this.config.verbose) {
        const tps =
          duration > 0 ? (outputTokens / duration).toFixed(2) : "Infinity";
        this.log(chalk.cyan(`  ⚡ Tokens per second (output): ${tps}`));
        this.log(
          chalk.dim(
            `     (Duration: ${duration.toFixed(
              2
            )}s, Output Tokens: ${outputTokens})`
          )
        );
      }

      // Add the response to the conversation (only for main conversation)
      if (!isExternalReview) {
        this.conversation.push({
          role: "assistant",
          content: responseContent,
        });

        // Save conversation history after API call (only for main conversation)
        // Use the defined currentStepLabel
        this.saveConversationHistory(currentStepLabel);
      }

      return responseContent;
    } catch (error: any) {
      this.spinner.fail(
        `API call failed (attempt ${retryCount + 1}/${
          this.config.maxRetries + 1
        })`
      );
      console.error(
        chalk.red(`❌ Error during API call (Attempt ${retryCount + 1}):`),
        error?.message || error
      );

      // Save conversation history even on error (only for main conversation)
      if (!isExternalReview) {
        // Use the defined currentStepLabel
        this.saveConversationHistory(
          `API Call Error - ${currentStepLabel} - Attempt ${retryCount + 1}`
        );
      }

      if (retryCount < this.config.maxRetries) {
        this.log(
          chalk.yellow(
            `  ↪ Retrying in ${this.config.retryDelay / 1000} seconds...`
          )
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.retryDelay)
        );
        this.spinner.start("Retrying API call");
        return this.callOpenAI(prompt, retryCount + 1, isExternalReview);
      }

      console.error(
        chalk.red("❌ Error calling OpenAI API:"),
        error?.message || error
      );
      throw error;
    }
  }

  // Helper method to update estimated cost
  private updateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    // Attempt to find exact match first, then base model
    let pricing = pricingData.get(model);
    if (!pricing) {
      // Try matching base model name (e.g., gpt-4o, claude-3-7-sonnet)
      const baseModelMatch = model.match(
        /^(gpt-4o|gpt-4o-mini|o1|o3-mini|claude-3-opus|claude-3-sonnet|claude-3-haiku|claude-3-5-sonnet|claude-3-7-sonnet)/
      );
      const baseModel = baseModelMatch ? baseModelMatch[0] : model; // Use matched base or original if no match
      if (baseModel !== model) {
        pricing = pricingData.get(baseModel);
      }
      // Special handling for claude-3-7-sonnet-latest if not found directly
      if (!pricing && model.includes("claude-3-7-sonnet")) {
        pricing = pricingData.get("claude-3-7-sonnet-latest");
      }
    }

    if (pricing) {
      const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPerMillion;
      const outputCost =
        (outputTokens / 1_000_000) * pricing.outputCostPerMillion;
      const callCost = inputCost + outputCost; // Reasoning tokens are billed as output tokens for o-series/Claude thinking
      this.estimatedCost += callCost;
      if (this.config.verbose) {
        this.log(
          chalk.dim(
            `  💲 Cost for this call ($${callCost.toFixed(
              5
            )}): Input $${inputCost.toFixed(
              5
            )} (${inputTokens} tokens) + Output $${outputCost.toFixed(
              5
            )} (${outputTokens} tokens)`
          )
        );
      }
    } else {
      if (this.config.verbose) {
        this.log(
          chalk.yellow(
            `  ⚠️ No pricing data found for model: ${model}. Cost calculation skipped for this call.`
          )
        );
      }
    }
  }

  // No longer needed - final save handled in execute() and saveLatestTranslationOnError()
  // private saveTranslation(translation: string): void { ... }

  // Helper method to save the translation metrics
  private saveTranslationMetrics(): void {
    // Convert metrics Map to an object for saving
    const metricsObject: Record<string, any> = {
      source: this.sourceMetrics,
    };

    this.translationMetrics.forEach((value, key) => {
      metricsObject[key] = value;
    });

    // Save to intermediates directory
    fs.writeFileSync(this.metricsPath, JSON.stringify(metricsObject, null, 2));
    this.outputFiles["Translation Metrics"] = this.metricsPath;

    this.log(
      chalk.green(`📊 Translation metrics saved to ${this.metricsPath}`)
    );
  }

  // Helper method to save the conversation history
  private saveConversationHistory(label = "Update"): void {
    try {
      // Save in JSON format (for programmatic use)
      const conversationWithMetadata = {
        metadata: {
          timestamp: new Date().toISOString(),
          label: label,
          step: this.stepCounter,
          totalTokens: this.totalTokens,
          totalInputTokens: this.totalInputTokens,
          totalOutputTokens: this.totalOutputTokens,
          estimatedCost: this.estimatedCost,
        },
        conversation: this.conversation,
      };

      // Save to intermediates directory
      fs.writeFileSync(
        this.conversationJsonPath,
        JSON.stringify(conversationWithMetadata, null, 2)
      );
      this.outputFiles["Conversation History (JSON)"] =
        this.conversationJsonPath;

      // Also save in a more human-readable format
      let readableHistory = `# Translation Conversation History\n\n`;
      readableHistory += `Last update: ${new Date().toISOString()}\n`;
      readableHistory += `Label: ${label}\n`;
      readableHistory += `Step: ${this.stepCounter}\n`;
      readableHistory += `Total tokens used: ${this.totalTokens.toLocaleString()}\n`;
      readableHistory += `Input tokens: ${this.totalInputTokens.toLocaleString()}\n`;
      readableHistory += `Output tokens: ${this.totalOutputTokens.toLocaleString()}\n`;
      readableHistory += `Estimated total cost: $${this.estimatedCost.toFixed(
        4
      )}\n\n`;
      readableHistory += `${"=".repeat(80)}\n\n`;

      this.conversation.forEach((message, index) => {
        if (index > 0) readableHistory += "\n\n" + "-".repeat(80) + "\n\n";
        readableHistory += `## ${message.role.toUpperCase()}:\n\n${
          message.content
        }`;
      });

      // Save to intermediates directory
      fs.writeFileSync(this.conversationTextPath, readableHistory);
      this.outputFiles["Conversation History (Text)"] =
        this.conversationTextPath;

      // Removed verbose log for history update
    } catch (error) {
      console.error(
        chalk.yellow("⚠️ Warning: Failed to save conversation history:"),
        error
      );
      // Non-fatal error - continue with the translation process
    }
  }

  // Saves the latest available translation file to the final output path on error
  public saveLatestTranslationOnError(): void {
    const translationFileOrder = [
      "13_refined_final_translation.txt",
      "11_final_translation.txt",
      "09_further_improved_translation.txt",
      "07_improved_translation.txt",
      "05_first_translation.txt",
    ];

    let latestFileFound: string | null = null;

    for (const filename of translationFileOrder) {
      const potentialPath = path.join(this.config.outputDir, filename);
      if (fs.existsSync(potentialPath)) {
        latestFileFound = potentialPath;
        break; // Found the latest one
      }
    }

    if (latestFileFound) {
      try {
        const content = fs.readFileSync(latestFileFound, "utf-8");
        fs.writeFileSync(this.finalOutputPath, content);
        console.log(
          chalk.yellow(
            `⚠️ Process interrupted. Saved latest available translation (${path.basename(
              latestFileFound
            )}) to: ${this.finalOutputPath}`
          )
        );
      } catch (saveError) {
        console.error(
          chalk.red(
            `❌ Failed to save latest translation on error from ${latestFileFound} to ${this.finalOutputPath}:`
          ),
          saveError
        );
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️ Process interrupted. No intermediate translation files found to save.`
        )
      );
    }
  }

  // Calculate metrics for a piece of text
  private calculateMetrics(
    text: string,
    isSourceText: boolean = false
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

    // Count words - this is a simple implementation
    // For languages like Chinese/Japanese, we'll need more sophisticated methods
    let wordCount = 0;
    const language = isSourceText
      ? this.config.sourceLanguage
      : this.config.targetLanguage;

    // If source language isn't specified for source text, default to generic word counting
    const effectiveLanguage = language?.toLowerCase() || "unknown";

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
      : this.sourceMetrics?.sourceWordCount ?? 0;
    const sourceC = isSourceText
      ? charCount
      : this.sourceMetrics?.sourceCharCount ?? 0;

    return {
      sourceWordCount: sourceW,
      targetWordCount: wordCount,
      sourceCharCount: sourceC,
      targetCharCount: charCount,
      ratio: sourceW > 0 ? wordCount / sourceW : 0, // Avoid division by zero
      estimatedReadingTime: readingTime,
    };
  }

  // Display metrics for source text
  private displaySourceMetrics(): void {
    this.log(chalk.cyan(`📏 Source text metrics:`));
    if (this.config.sourceLanguage) {
      this.log(chalk.cyan(`   Language: ${this.config.sourceLanguage}`));
    } else {
      this.log(chalk.cyan(`   Language: (Auto-detected/Not specified)`));
    }
    this.log(
      chalk.cyan(
        `   Word count: ${this.sourceMetrics.sourceWordCount.toLocaleString()}`
      )
    );
    this.log(
      chalk.cyan(
        `   Character count: ${this.sourceMetrics.sourceCharCount.toLocaleString()}`
      )
    );
    this.log(
      chalk.cyan(
        `   Estimated reading time: ${this.formatTime(
          this.sourceMetrics.estimatedReadingTime
        )}`
      )
    );
  }

  // Display metrics for a translation step
  private displayMetrics(label: string, metrics: TranslationMetrics): void {
    this.log(chalk.cyan(`📏 ${label} metrics:`));
    this.log(
      chalk.cyan(`   Word count: ${metrics.targetWordCount.toLocaleString()}`)
    );
    this.log(
      chalk.cyan(
        `   Character count: ${metrics.targetCharCount.toLocaleString()}`
      )
    );
    this.log(
      chalk.cyan(
        `   Estimated reading time: ${this.formatTime(
          metrics.estimatedReadingTime
        )}`
      )
    );
  }

  // Display comparison with source text
  private displayComparisonWithSource(metrics: TranslationMetrics): void {
    // Check if source counts are valid
    const validSource =
      this.sourceMetrics &&
      this.sourceMetrics.sourceWordCount > 0 &&
      this.sourceMetrics.sourceCharCount > 0;

    const wordCountRatio = validSource
      ? (
          (metrics.targetWordCount / this.sourceMetrics.sourceWordCount) *
          100
        ).toFixed(1)
      : "N/A";
    const charCountRatio = validSource
      ? (
          (metrics.targetCharCount / this.sourceMetrics.sourceCharCount) *
          100
        ).toFixed(1)
      : "N/A";

    this.log(chalk.magenta(`📊 Comparison with source text:`));
    this.log(
      chalk.magenta(
        `   Word count ratio: ${wordCountRatio}${
          validSource ? "%" : ""
        } of source`
      )
    );
    this.log(
      chalk.magenta(
        `   Character count ratio: ${charCountRatio}${
          validSource ? "%" : ""
        } of source`
      )
    );

    // Visualize the difference
    const ratioValue = validSource
      ? metrics.targetWordCount / this.sourceMetrics.sourceWordCount
      : 0;
    const wordBar = this.createProgressBar(ratioValue, validSource);
    this.log(chalk.magenta(`   Word ratio: ${wordBar}`));
  }

  // Display the translation journey metrics
  private displayTranslationJourney(): void {
    this.logHeader("Translation Journey");

    // Display a table showing the word count over time
    const firstTranslation = this.translationMetrics.get("first_translation");
    const improvedTranslation = this.translationMetrics.get(
      "improved_translation"
    );
    const furtherImprovedTranslation = this.translationMetrics.get(
      "further_improved_translation"
    );
    const finalTranslation = this.translationMetrics.get("final_translation");
    const refinedFinalTranslation = this.translationMetrics.get(
      "refined_final_translation"
    );

    if (
      !firstTranslation ||
      !improvedTranslation ||
      !furtherImprovedTranslation ||
      !finalTranslation
    ) {
      return;
    }

    this.log(chalk.cyan(`📈 Word count progression:`));
    this.log(
      chalk.cyan(
        `   05 First draft:         ${firstTranslation.targetWordCount.toLocaleString()} words`
      )
    );
    this.log(
      chalk.cyan(
        `   07 First improvement:   ${improvedTranslation.targetWordCount.toLocaleString()} words (${this.calculateChange(
          firstTranslation.targetWordCount,
          improvedTranslation.targetWordCount
        )})`
      )
    );
    this.log(
      chalk.cyan(
        `   09 Second improvement:  ${furtherImprovedTranslation.targetWordCount.toLocaleString()} words (${this.calculateChange(
          improvedTranslation.targetWordCount,
          furtherImprovedTranslation.targetWordCount
        )})`
      )
    );

    if (refinedFinalTranslation) {
      this.log(
        chalk.cyan(
          `   11 Final translation:    ${finalTranslation.targetWordCount.toLocaleString()} words (${this.calculateChange(
            furtherImprovedTranslation.targetWordCount,
            finalTranslation.targetWordCount
          )})`
        )
      );
    }

    // Visual representation of the journey
    this.log(chalk.magenta(`\n📊 Translation evolution:`));

    const firstBar = this.createProgressBar(
      firstTranslation.targetWordCount / this.sourceMetrics.sourceWordCount
    );
    const improvedBar = this.createProgressBar(
      improvedTranslation.targetWordCount / this.sourceMetrics.sourceWordCount
    );
    const furtherBar = this.createProgressBar(
      furtherImprovedTranslation.targetWordCount /
        this.sourceMetrics.sourceWordCount
    );
    const finalBar = this.createProgressBar(
      finalTranslation.targetWordCount / this.sourceMetrics.sourceWordCount
    );

    this.log(chalk.magenta(`   Source:           ${"▓".repeat(20)}`));
    this.log(chalk.magenta(`   First draft:      ${firstBar}`));
    this.log(chalk.magenta(`   First improve:    ${improvedBar}`));
    this.log(chalk.magenta(`   Second improve:   ${furtherBar}`));
    this.log(chalk.magenta(`   Final:            ${finalBar}`));

    if (refinedFinalTranslation) {
      const refinedBar = this.createProgressBar(
        refinedFinalTranslation.targetWordCount /
          this.sourceMetrics.sourceWordCount
      );
      this.log(chalk.magenta(`   Refined final:     ${refinedBar}`));
    }
  }

  // Create a visual progress bar
  private createProgressBar(
    ratio: number,
    validSource: boolean = true
  ): string {
    if (!validSource) {
      return chalk.gray("N/A (source metrics unavailable)");
    }
    const width = 20;
    const filled = Math.round(ratio * width);
    const empty = width - filled;

    let bar = "";

    if (ratio > 1) {
      // More than 100%
      bar =
        "▓".repeat(width) +
        " " +
        chalk.yellow("+" + Math.round((ratio - 1) * 100) + "%");
    } else if (ratio >= 0) {
      // Less than or equal to 100%
      bar = "▓".repeat(filled) + "░".repeat(empty);
    } else {
      bar = chalk.gray("Invalid ratio");
    }

    return bar;
  }

  // Calculate percentage change between two numbers
  private calculateChange(from: number, to: number): string {
    const change = ((to - from) / from) * 100;
    if (change > 0) {
      return chalk.green(`+${change.toFixed(1)}%`);
    } else if (change < 0) {
      return chalk.red(`${change.toFixed(1)}%`);
    } else {
      return "0%";
    }
  }

  // Format time in minutes and seconds
  private formatTime(timeInMinutes: number): string {
    if (timeInMinutes < 1) {
      return `${Math.round(timeInMinutes * 60)} seconds`;
    } else {
      const minutes = Math.floor(timeInMinutes);
      const seconds = Math.round((timeInMinutes - minutes) * 60);
      return `${minutes} min ${seconds} sec`;
    }
  }

  // Format duration in hours, minutes, and seconds
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)} seconds`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes} min ${remainingSeconds} sec`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${hours} hr ${minutes} min ${remainingSeconds} sec`;
    }
  }

  // Helper method for logging
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }

  // Helper method for section headers
  private logHeader(title: string): void {
    if (this.config.verbose) {
      console.log("\n" + chalk.bgBlue.white(` ${title} `) + "\n");
    }
  }
}

// Command line interface
const program = new Command();

program
  .name("translate")
  .description("AI-powered literary translation workflow")
  .version("1.0.0")
  .requiredOption("-i, --input <path>", "Path to the input file")
  .requiredOption(
    "-o, --output <directory>",
    "Directory to save final translation"
  )
  .option(
    "-s, --source <language>",
    "Source language (optional, will be auto-detected if omitted)"
  )
  .requiredOption("-t, --target <language>", "Target language")
  .option("-m, --model <n>", "OpenAI model name", "gpt-4o")
  .option("-v, --verbose", "Verbose output", true)
  .option("-r, --retries <number>", "Maximum number of API call retries", "3")
  .option("-d, --delay <ms>", "Delay between retries in milliseconds", "5000")
  .option("--skip-external-review", "Skip external review step", false)
  .option(
    "--instructions <text>",
    "Custom translation instructions (e.g., target audience, formality level, etc.)"
  )
  .option(
    "--instructions-file <path>",
    "Path to a file containing custom translation instructions"
  )
  .option(
    "--reasoning-effort <level>",
    "Reasoning effort for o1/o3 models (low, medium, high)",
    "medium"
  )
  .option(
    "--max-output-tokens <number>",
    "Maximum total tokens (output + reasoning) for API calls",
    "30000"
  )
  .action(async (options) => {
    let workflow: TranslationWorkflow | null = null; // Define workflow here for access in catch

    // --- Model-Specific Adjustments ---
    let maxOutputTokens = parseInt(options.maxOutputTokens); // Get initial value
    const modelLimit = 16384; // Specific limit for gpt-4.5-preview

    if (options.model === "gpt-4.5-preview") {
      const optionSource = program.getOptionValueSource("maxOutputTokens"); // Check if user provided the value

      if (optionSource !== "user") {
        // Check if the value is the default
        // Default value is being used, check if it exceeds the model limit
        if (maxOutputTokens > modelLimit) {
          console.log(
            chalk.yellow(
              `⚠️ Model ${options.model} has a limit of ${modelLimit} output tokens. Automatically adjusting --max-output-tokens from default ${maxOutputTokens} to ${modelLimit}.`
            )
          );
          maxOutputTokens = modelLimit; // Adjust to the model's limit
        }
      } else {
        // User explicitly set the value, warn if it exceeds the limit
        if (maxOutputTokens > modelLimit) {
          console.warn(
            chalk.red(
              `❌ Explicit --max-output-tokens (${maxOutputTokens}) exceeds the limit (${modelLimit}) for model ${options.model}. This will likely cause an API error.`
            )
          );
          // We respect the user's value but issue a strong warning
        }
      }
    }
    // --- End Model-Specific Adjustments ---

    try {
      // Validate input file exists
      if (!fs.existsSync(options.input)) {
        console.error(chalk.red(`❌ Input file not found: ${options.input}`));
        process.exit(1);
      }

      // Read input file
      const sourceText = fs.readFileSync(options.input, "utf-8");
      const inputPath = options.input;
      const parsedPath = path.parse(inputPath);
      const originalFilename = parsedPath.name;
      const originalExtension = parsedPath.ext;

      // Create output directory if it doesn't exist (intermediates created in constructor)
      if (!fs.existsSync(options.output)) {
        fs.mkdirSync(options.output, { recursive: true });
      }

      // Validate API key is set
      if (!process.env.OPENAI_API_KEY) {
        console.error(
          chalk.red("❌ OPENAI_API_KEY environment variable is not set")
        );
        console.log(
          chalk.yellow("💡 Set it in a .env file or export it in your shell")
        );
        process.exit(1);
      }

      // Check for Anthropic API key
      if (process.env.ANTHROPIC_API_KEY) {
        console.log(
          chalk.green(
            "✅ ANTHROPIC_API_KEY found - will use Claude 3.5 Sonnet for external review"
          )
        );
      } else {
        console.log(
          chalk.yellow(
            "ℹ️ ANTHROPIC_API_KEY not found - will use OpenAI for external review"
          )
        );
      }

      // Handle custom instructions (prioritize file over direct instructions)
      let customInstructions = options.instructions || "";
      if (options.instructionsFile && fs.existsSync(options.instructionsFile)) {
        console.log(
          chalk.green(
            `📝 Reading custom instructions from file: ${options.instructionsFile}`
          )
        );
        customInstructions = fs.readFileSync(options.instructionsFile, "utf-8");
      } else if (options.instructionsFile) {
        console.warn(
          chalk.yellow(
            `⚠️ Instructions file not found: ${options.instructionsFile}`
          )
        );
      }

      if (customInstructions) {
        console.log(chalk.cyan("🔍 Using custom translation instructions"));
        if (options.verbose) {
          console.log(
            chalk.dim("---------------- Custom Instructions ----------------")
          );
          console.log(chalk.dim(customInstructions));
          console.log(
            chalk.dim("---------------------------------------------------")
          );
        }
      }

      console.log(chalk.cyan("🚀 Starting AI-powered translation workflow"));
      console.log(chalk.cyan(`📂 Output directory: ${options.output}`));

      // Create configuration
      const config: TranslationConfig = {
        sourceLanguage: options.source,
        targetLanguage: options.target,
        sourceText,
        outputDir: options.output,
        modelName: options.model,
        verbose: options.verbose,
        maxRetries: parseInt(options.retries),
        retryDelay: parseInt(options.delay),
        skipExternalReview: options.skipExternalReview,
        customInstructions: customInstructions || undefined,
        reasoningEffort: options.reasoningEffort,
        maxOutputTokens: maxOutputTokens, // Use the potentially adjusted value
        originalFilename,
        originalExtension,
        inputPath,
      };

      // Create and execute workflow
      workflow = new TranslationWorkflow(config);
      await workflow.execute();
    } catch (error) {
      console.error(chalk.red("\n❌ Translation workflow failed:"), error);
      // Attempt to save the latest available translation
      if (workflow) {
        workflow.saveLatestTranslationOnError();
      }
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
