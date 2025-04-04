import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import {
  ConversationMessage,
  TranslationConfig,
  TranslationMetrics,
} from "../types";
import { AiService, CostResult, AiRequestOptions } from "../services/ai";
import { Logger } from "../utils/logger";
import { XmlProcessor } from "../utils/xml";
import {
  calculateMetricsForLanguage,
  createProgressBar,
  ensureDirectoryExists,
  findLatestFile,
  findFilesInDirectory,
  formatTime,
  formatDuration,
  saveText,
  saveJson,
  loadJson,
  loadText,
  calculateChange,
} from "../utils";
import { prompts } from "../prompts/translation";

/**
 * Main translation workflow class
 * Orchestrates the multi-stage translation process
 */
export class TranslationWorkflow {
  private conversation: ConversationMessage[] = [];
  private config: TranslationConfig;
  private intermediatesDir: string;
  private spinner = ora();
  private totalTokens = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private estimatedCost = 0;
  private xmlProcessor: XmlProcessor;
  private translationSteps: string[] = [];
  private outputFiles: { [key: string]: string } = {};
  private stepCounter = 0;
  private conversationJsonPath: string;
  private conversationTextPath: string;
  private metricsPath: string;
  private sourceMetrics!: TranslationMetrics;
  private translationMetrics: Map<string, TranslationMetrics> = new Map();
  private finalOutputPath: string;
  private aiService: AiService;
  private logger: Logger;
  private spinnerStartTime: number = 0;
  private spinnerInterval: NodeJS.Timeout | null = null;

  constructor(config: TranslationConfig) {
    this.config = config;
    this.logger = new Logger(this.config.verbose);
    this.aiService = new AiService();
    this.xmlProcessor = new XmlProcessor();

    // Initialize properties
    let resumed = false;

    // Define paths
    this.intermediatesDir = path.join(
      this.config.outputDir,
      ".translation-intermediates"
    );

    this.finalOutputPath = path.join(
      this.config.outputDir,
      `${this.config.originalFilename}-${this.config.targetLanguage}${this.config.originalExtension}`
    );

    // Create directories
    ensureDirectoryExists(this.config.outputDir);
    ensureDirectoryExists(this.intermediatesDir);

    // Set file paths
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

    // Try to resume or initialize new conversation
    if (!this.tryResume()) {
      this.initializeNewConversation();
    }
  }

  /**
   * Try to resume a previous translation session
   */
  private tryResume(): boolean {
    if (loadText(this.conversationJsonPath, "").length === 0) {
      return false;
    }

    try {
      const historyData = loadJson<{
        metadata: {
          timestamp: string;
          label: string;
          step: number;
          totalTokens: number;
          totalInputTokens: number;
          totalOutputTokens: number;
          estimatedCost: number;
        };
        conversation: ConversationMessage[];
      }>(this.conversationJsonPath, {
        metadata: {
          timestamp: "",
          label: "",
          step: 0,
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          estimatedCost: 0,
        },
        conversation: [],
      });

      if (historyData.conversation && historyData.metadata) {
        this.conversation = historyData.conversation;
        this.totalTokens = historyData.metadata.totalTokens || 0;
        this.stepCounter = historyData.metadata.step || 0;
        const lastLabel = historyData.metadata.label || "Unknown Step";

        // Load cost tracking data
        this.totalInputTokens = historyData.metadata.totalInputTokens || 0;
        this.totalOutputTokens = historyData.metadata.totalOutputTokens || 0;
        this.estimatedCost = historyData.metadata.estimatedCost || 0;

        // Scan intermediates directory for existing step files
        const files = findFilesInDirectory(
          this.intermediatesDir,
          /^\d{2}_.*\.txt$/
        );
        files.forEach((filePath) => {
          const fileName = path.basename(filePath);
          // Convert filename like 01_initial_analysis.txt to "01 Initial Analysis"
          const stepKey = fileName
            .substring(0, fileName.length - 4) // Remove .txt
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase());
          this.outputFiles[stepKey] = filePath;
        });

        // Reconstruct translation steps
        const stepNames = [
          "Initial Analysis",
          "Expression Exploration",
          "Cultural Adaptation Discussion",
          "Title & Inspiration Exploration",
          "First Translation",
          "Self-Critique & First Refinement",
          "Second Refinement",
          "Final Translation",
          "External Review",
          "Final Refinement",
        ];

        // Extract step numbers from keys and sort them
        this.translationSteps = Object.keys(this.outputFiles)
          .filter((key) => /^\d{2}\s/.test(key))
          .sort((a, b) => {
            const numA = parseInt(a.substring(0, 2));
            const numB = parseInt(b.substring(0, 2));
            return numA - numB;
          })
          .map((key) => {
            const stepNum = parseInt(key.substring(0, 2)) - 1;
            return stepNum >= 0 && stepNum < stepNames.length
              ? stepNames[stepNum]
              : key.substring(3);
          });

        // Load existing metrics
        const metricsData = loadJson<Record<string, any>>(this.metricsPath, {
          source: null,
        });

        if (metricsData.source) {
          this.sourceMetrics = metricsData.source as TranslationMetrics;
        } else {
          this.sourceMetrics = calculateMetricsForLanguage(
            this.config.sourceText,
            this.config.sourceLanguage,
            true
          );
        }

        Object.entries(metricsData).forEach(([key, value]) => {
          if (key !== "source") {
            this.translationMetrics.set(key, value as TranslationMetrics);
          }
        });

        this.logger.success(
          `🔄 Resuming translation workflow from step ${this.stepCounter} (${lastLabel})`
        );
        return true;
      }
    } catch (error) {
      this.logger.error(
        `❌ Error reading or parsing conversation history file. Starting fresh: ${error}`
      );
    }

    return false;
  }

  /**
   * Initialize a new conversation
   */
  private initializeNewConversation(): void {
    // Calculate source metrics
    this.sourceMetrics = calculateMetricsForLanguage(
      this.config.sourceText,
      this.config.sourceLanguage,
      true
    );

    // Reset state
    this.conversation = [];
    this.totalTokens = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.estimatedCost = 0;
    this.stepCounter = 0;
    this.translationSteps = [];
    this.translationMetrics = new Map();
    this.outputFiles = {};

    // Build initial system prompt with initial_analysis as the target step
    const systemPrompt = prompts.system(
      this.config.targetLanguage,
      this.config.sourceLanguage,
      this.config.customInstructions,
      "initial_analysis" // Start with the first step
    );

    // Add system prompt to conversation
    this.conversation.push({
      role: "system",
      content: systemPrompt,
    });

    // Save initial state
    this.saveConversationHistory("Initial system prompt");
  }

  /**
   * Main execution method
   */
  public async execute(): Promise<void> {
    this.logger.logHeader("Starting Translation Workflow");
    this.logger.log(
      chalk.blue(
        `📄 Translating ${
          this.config.sourceLanguage
            ? `from ${this.config.sourceLanguage} `
            : ""
        }to ${this.config.targetLanguage}`
      )
    );
    this.logger.log(chalk.blue(`   Input file: ${this.config.inputPath}`));
    this.logger.log(chalk.blue(`   Output file: ${this.finalOutputPath}`));
    this.logger.log(chalk.blue(`   Intermediates: ${this.intermediatesDir}`));
    this.displaySourceMetrics();

    const startTime = Date.now();
    let latestTranslationContent = ""; // Track the latest completed translation text

    try {
      // Step 1: Initial Analysis
      if (this.stepCounter <= 0) {
        this.stepCounter = 1;
        this.startSpinnerWithTimer("Step 1/10: Analyzing source text");

        const initialAnalysisPrompt = prompts.initialAnalysis(
          this.config.sourceText,
          this.config.targetLanguage,
          this.config.sourceLanguage
        );

        const analysisResponse = await this.callAiService(
          initialAnalysisPrompt
        );
        const analysisContent = this.xmlProcessor.extractTagContent(
          analysisResponse,
          "analysis"
        );

        // Save analysis to file
        const analysisPath = path.join(
          this.intermediatesDir,
          "01_initial_analysis.txt"
        );
        saveText(analysisPath, analysisContent);
        this.outputFiles["01 Initial Analysis"] = analysisPath;

        // Add to translation steps
        this.translationSteps.push("Initial Analysis");
        this.succeedSpinner("✅ Initial analysis completed");
        this.logger.success("Initial analysis saved to intermediates");
      }

      // Step 2: Expression Exploration
      if (this.stepCounter <= 1) {
        this.stepCounter = 2;
        this.startSpinnerWithTimer(
          "Step 2/10: Exploring expressions in target language"
        );

        const expressionExplorationPrompt = prompts.expressionExploration(
          this.config.sourceText,
          this.config.targetLanguage
        );

        const expressionResponse = await this.callAiService(
          expressionExplorationPrompt
        );
        const expressionContent = this.xmlProcessor.extractTagContent(
          expressionResponse,
          "expression_exploration"
        );

        // Save expressions to file
        const expressionPath = path.join(
          this.intermediatesDir,
          "02_expression_exploration.txt"
        );
        saveText(expressionPath, expressionContent);
        this.outputFiles["02 Expression Exploration"] = expressionPath;

        // Add to translation steps
        this.translationSteps.push("Expression Exploration");
        this.succeedSpinner("✅ Expression exploration completed");
        this.logger.success("Expression exploration saved to intermediates");
      }

      // Step 3: Cultural Adaptation
      if (this.stepCounter <= 2) {
        this.stepCounter = 3;
        this.startSpinnerWithTimer("Step 3/10: Discussing cultural adaptation");

        const culturalAdaptationPrompt = prompts.toneAndCulturalDiscussion(
          this.config.sourceText,
          this.config.targetLanguage
        );

        const culturalResponse = await this.callAiService(
          culturalAdaptationPrompt
        );
        const culturalContent = this.xmlProcessor.extractTagContent(
          culturalResponse,
          "cultural_discussion"
        );

        // Save cultural adaptation to file
        const culturalPath = path.join(
          this.intermediatesDir,
          "03_cultural_adaptation.txt"
        );
        saveText(culturalPath, culturalContent);
        this.outputFiles["03 Cultural Adaptation Discussion"] = culturalPath;

        // Add to translation steps
        this.translationSteps.push("Cultural Adaptation Discussion");
        this.succeedSpinner("✅ Cultural adaptation discussion completed");
        this.logger.success(
          "Cultural adaptation discussion saved to intermediates"
        );
      }

      // Step 4: Title & Inspiration Exploration
      if (this.stepCounter <= 3) {
        this.stepCounter = 4;
        this.startSpinnerWithTimer("Step 4/10: Exploring title & inspiration");

        const titleInspirationPrompt = prompts.titleAndInspirationExploration(
          this.config.sourceText,
          this.config.targetLanguage
        );

        const titleResponse = await this.callAiService(titleInspirationPrompt);
        const titleContent = this.xmlProcessor.extractTagContent(
          titleResponse,
          "title_options"
        );

        // Save title & inspiration to file
        const titlePath = path.join(
          this.intermediatesDir,
          "04_title_inspiration.txt"
        );
        saveText(titlePath, titleContent);
        this.outputFiles["04 Title & Inspiration Exploration"] = titlePath;

        // Add to translation steps
        this.translationSteps.push("Title & Inspiration Exploration");
        this.succeedSpinner("✅ Title & inspiration exploration completed");
        this.logger.success(
          "Title & inspiration exploration saved to intermediates"
        );
      }

      // Step 5: First Translation
      if (this.stepCounter <= 4) {
        this.stepCounter = 5;
        this.startSpinnerWithTimer(
          "Step 5/10: Creating first translation draft"
        );

        const firstTranslationPrompt = prompts.firstTranslationAttempt(
          this.config.sourceText,
          this.config.targetLanguage
        );

        const translationResponse = await this.callAiService(
          firstTranslationPrompt
        );
        const translationContent = this.xmlProcessor.extractTagContent(
          translationResponse,
          "first_translation"
        );

        // Save first translation to file
        const translationPath = path.join(
          this.intermediatesDir,
          "05_first_translation.txt"
        );
        saveText(translationPath, translationContent);
        this.outputFiles["05 First Translation"] = translationPath;

        // Update latest translation content
        latestTranslationContent = translationContent;

        // Calculate metrics for this step
        const metrics = calculateMetricsForLanguage(
          translationContent,
          this.config.targetLanguage,
          false,
          this.sourceMetrics
        );

        this.translationMetrics.set("first_translation", metrics);

        // Add to translation steps
        this.translationSteps.push("First Translation");
        this.succeedSpinner("✅ First translation draft completed");
        this.logger.success("First translation draft saved to intermediates");
      }

      // Step 6: Self-critique & First Refinement
      if (this.stepCounter <= 5) {
        this.stepCounter = 6;
        this.startSpinnerWithTimer(
          "Step 6/10: Self-critique & first refinement"
        );

        // Get the previous translation content
        const prevTranslationPath = path.join(
          this.intermediatesDir,
          "05_first_translation.txt"
        );
        const prevTranslation = loadText(prevTranslationPath, "");

        const selfCritiquePrompt = prompts.selfCritiqueAndRefinement(
          this.config.targetLanguage,
          this.config.sourceLanguage,
          this.config.sourceText,
          prevTranslation
        );

        const critiqueResponse = await this.callAiService(selfCritiquePrompt);
        const improvedTranslation = this.xmlProcessor.extractTagContent(
          critiqueResponse,
          "improved_translation"
        );

        // Save improved translation to file
        const improvedPath = path.join(
          this.intermediatesDir,
          "07_improved_translation.txt"
        );
        saveText(improvedPath, improvedTranslation);
        this.outputFiles["07 Improved Translation"] = improvedPath;

        // Update latest translation content
        latestTranslationContent = improvedTranslation;

        // Calculate metrics for this step
        const metrics = calculateMetricsForLanguage(
          improvedTranslation,
          this.config.targetLanguage,
          false,
          this.sourceMetrics
        );

        this.translationMetrics.set("improved_translation", metrics);

        // Add to translation steps
        this.translationSteps.push("Self-Critique & First Refinement");
        this.succeedSpinner("✅ Self-critique & first refinement completed");
        this.logger.success("Improved translation saved to intermediates");
      }

      // Step 7: Second Refinement
      if (this.stepCounter <= 6) {
        this.stepCounter = 7;
        this.startSpinnerWithTimer("Step 7/10: Second refinement");

        // Get the previous translation content
        const prevTranslationPath = path.join(
          this.intermediatesDir,
          "07_improved_translation.txt"
        );
        const prevTranslation = loadText(prevTranslationPath, "");

        const secondRefinementPrompt = prompts.furtherRefinement(
          this.config.targetLanguage,
          this.config.sourceLanguage,
          this.config.sourceText,
          prevTranslation
        );

        const secondRefineResponse = await this.callAiService(
          secondRefinementPrompt
        );
        const furtherImprovedTranslation = this.xmlProcessor.extractTagContent(
          secondRefineResponse,
          "further_improved_translation"
        );

        // Save further improved translation to file
        const furtherImprovedPath = path.join(
          this.intermediatesDir,
          "09_further_improved_translation.txt"
        );
        saveText(furtherImprovedPath, furtherImprovedTranslation);
        this.outputFiles["09 Further Improved Translation"] =
          furtherImprovedPath;

        // Update latest translation content
        latestTranslationContent = furtherImprovedTranslation;

        // Calculate metrics for this step
        const metrics = calculateMetricsForLanguage(
          furtherImprovedTranslation,
          this.config.targetLanguage,
          false,
          this.sourceMetrics
        );

        this.translationMetrics.set("further_improved_translation", metrics);

        // Add to translation steps
        this.translationSteps.push("Second Refinement");
        this.succeedSpinner("✅ Second refinement completed");
        this.logger.success(
          "Further improved translation saved to intermediates"
        );
      }

      // Step 8: Final Translation
      if (this.stepCounter <= 7) {
        this.stepCounter = 8;
        this.startSpinnerWithTimer("Step 8/10: Creating final translation");

        // Get the previous translation content
        const prevTranslationPath = path.join(
          this.intermediatesDir,
          "09_further_improved_translation.txt"
        );
        const prevTranslation = loadText(prevTranslationPath, "");

        // For final translation step, consider using a fresh conversation for long texts
        const estimatedSourceTokens = Math.ceil(
          this.config.sourceText.length / 4
        );
        const estimatedTranslationTokens = Math.ceil(
          prevTranslation.length / 4
        );

        // Get model's context limit
        const modelContextLimits: Record<string, number> = {
          // OpenAI models with 128K context window
          "gpt-4.5-preview": 128000,
          "gpt-4.5": 128000,
          "gpt-4o": 128000,
          "gpt-4o-mini": 128000,
          "gpt-4": 128000,

          // Claude models
          "claude-3-7-sonnet-latest": 128000,
          "claude-3-opus-20240229": 200000,
          "claude-3-sonnet-20240229": 128000,
          "claude-3-haiku-20240307": 48000,
          "claude-3-5-sonnet-20240620": 128000,
        };

        // Common model prefixes to check
        const prefixMap = {
          "gpt-4.5": 128000,
          "gpt-4o": 128000,
          "gpt-4": 128000,
          "claude-3-opus": 200000,
          "claude-3-sonnet": 128000,
          "claude-3-haiku": 48000,
          "claude-3.5": 128000,
          "claude-3-7": 128000,
        };

        let modelContextLimit = 0;

        // Try exact match first
        modelContextLimit = modelContextLimits[this.config.modelName] || 0;

        // If no exact match, try prefix matching
        if (!modelContextLimit) {
          for (const [prefix, limit] of Object.entries(prefixMap)) {
            if (this.config.modelName.startsWith(prefix)) {
              modelContextLimit = limit;
              if (this.config.verbose) {
                this.logger.info(
                  `📚 Matched model ${
                    this.config.modelName
                  } to prefix ${prefix} with ${limit.toLocaleString()} context limit`
                );
              }
              break;
            }
          }
        }

        if (!modelContextLimit) {
          modelContextLimit = 16384; // Default conservative limit
          this.logger.warn(
            `⚠️ Unknown model ${
              this.config.modelName
            }, using conservative default context limit of ${modelContextLimit.toLocaleString()} tokens`
          );
        }

        // If text is very large or conversation history is getting too big, reset conversation
        // Use 50% of the context limit as a threshold to be safe
        const currentConversationTokens = this.conversation.reduce(
          (total, msg) => total + Math.ceil(msg.content.length / 4),
          0
        );

        const resetThreshold = modelContextLimit * 0.5;
        const wouldExceedLimit =
          currentConversationTokens +
            estimatedSourceTokens +
            estimatedTranslationTokens >
          resetThreshold;

        if (wouldExceedLimit) {
          this.logger.info(
            `📝 Large translation or conversation history detected (${currentConversationTokens.toLocaleString()} tokens + ${estimatedSourceTokens.toLocaleString()} source tokens). Starting fresh conversation for final translation step.`
          );
          // Reset conversation with just the system message
          const systemPrompt = prompts.system(
            this.config.targetLanguage,
            this.config.sourceLanguage,
            this.config.customInstructions,
            "final_translation"
          );
          this.conversation = [
            {
              role: "system",
              content: systemPrompt,
            },
          ];
          this.saveConversationHistory("Reset for final translation");
        } else if (this.config.verbose) {
          this.logger.info(
            `📝 Continuing with existing conversation (${currentConversationTokens.toLocaleString()} tokens).`
          );
        }

        const finalTranslationPrompt = prompts.finalTranslation(
          this.config.targetLanguage,
          this.config.sourceLanguage,
          this.config.sourceText,
          prevTranslation
        );

        const finalResponse = await this.callAiService(finalTranslationPrompt);
        const finalTranslation = this.xmlProcessor.extractTagContent(
          finalResponse,
          "final_translation"
        );

        // Save final translation to file
        const finalPath = path.join(
          this.intermediatesDir,
          "11_final_translation.txt"
        );
        saveText(finalPath, finalTranslation);
        this.outputFiles["11 Final Translation"] = finalPath;

        // Update latest translation content
        latestTranslationContent = finalTranslation;

        // Calculate metrics for this step
        const metrics = calculateMetricsForLanguage(
          finalTranslation,
          this.config.targetLanguage,
          false,
          this.sourceMetrics
        );

        this.translationMetrics.set("final_translation", metrics);

        // Add to translation steps
        this.translationSteps.push("Final Translation");
        this.succeedSpinner("✅ Final translation completed");
        this.logger.success("Final translation saved to intermediates");
      }

      // Step 9: External Review (optional)
      let externalReviewContent = "";
      if (!this.config.skipExternalReview && this.stepCounter <= 8) {
        this.stepCounter = 9;
        this.startSpinnerWithTimer("Step 9/10: Conducting external review");

        // Get the final translation content
        const finalTranslationPath = path.join(
          this.intermediatesDir,
          "11_final_translation.txt"
        );
        const finalTranslation = loadText(finalTranslationPath, "");

        const externalReviewPrompt = prompts.externalReviewUser(
          this.config.targetLanguage,
          this.config.sourceLanguage,
          this.config.sourceText,
          finalTranslation
        );

        // Use a different model for external review if possible
        const externalResponse = await this.callAiService(
          externalReviewPrompt,
          0,
          true
        );
        externalReviewContent = this.xmlProcessor.extractTagContent(
          externalResponse,
          "external_review"
        );

        // Save external review to file
        const reviewPath = path.join(
          this.intermediatesDir,
          "12_external_review.txt"
        );
        saveText(reviewPath, externalReviewContent);
        this.outputFiles["12 External Review"] = reviewPath;

        // Add to translation steps
        this.translationSteps.push("External Review");
        this.succeedSpinner("✅ External review completed");
        this.logger.success("External review saved to intermediates");
      }

      // Step 10: Final Refinement
      if (
        (!this.config.skipExternalReview && this.stepCounter <= 9) ||
        (this.config.skipExternalReview && this.stepCounter <= 8)
      ) {
        this.stepCounter = 10;
        this.startSpinnerWithTimer("Step 10/10: Applying final refinements");

        // Get the final translation content
        const finalTranslationPath = path.join(
          this.intermediatesDir,
          "11_final_translation.txt"
        );
        const finalTranslation = loadText(finalTranslationPath, "");

        // For final refinement, manage conversation history for long texts
        const estimatedTranslationTokens = Math.ceil(
          finalTranslation.length / 4
        );
        const estimatedReviewTokens = externalReviewContent
          ? Math.ceil(externalReviewContent.length / 4)
          : 0;

        // Get model's context limit (same as in step 8)
        const modelContextLimits: Record<string, number> = {
          // OpenAI models with 128K context window
          "gpt-4.5-preview": 128000,
          "gpt-4.5": 128000,
          "gpt-4o": 128000,
          "gpt-4o-mini": 128000,
          "gpt-4": 128000,

          // Claude models
          "claude-3-7-sonnet-latest": 128000,
          "claude-3-opus-20240229": 200000,
          "claude-3-sonnet-20240229": 128000,
          "claude-3-haiku-20240307": 48000,
          "claude-3-5-sonnet-20240620": 128000,
        };

        // Common model prefixes to check
        const prefixMap = {
          "gpt-4.5": 128000,
          "gpt-4o": 128000,
          "gpt-4": 128000,
          "claude-3-opus": 200000,
          "claude-3-sonnet": 128000,
          "claude-3-haiku": 48000,
          "claude-3.5": 128000,
          "claude-3-7": 128000,
        };

        let modelContextLimit = 0;

        // Try exact match first
        modelContextLimit = modelContextLimits[this.config.modelName] || 0;

        // If no exact match, try prefix matching
        if (!modelContextLimit) {
          for (const [prefix, limit] of Object.entries(prefixMap)) {
            if (this.config.modelName.startsWith(prefix)) {
              modelContextLimit = limit;
              if (this.config.verbose) {
                this.logger.info(
                  `📚 Matched model ${
                    this.config.modelName
                  } to prefix ${prefix} with ${limit.toLocaleString()} context limit`
                );
              }
              break;
            }
          }
        }

        if (!modelContextLimit) {
          modelContextLimit = 16384; // Default conservative limit
          this.logger.warn(
            `⚠️ Unknown model ${
              this.config.modelName
            }, using conservative default context limit of ${modelContextLimit.toLocaleString()} tokens`
          );
        }

        // Calculate current conversation size and determine if we need to reset
        const currentConversationTokens = this.conversation.reduce(
          (total, msg) => total + Math.ceil(msg.content.length / 4),
          0
        );

        const resetThreshold = modelContextLimit * 0.5;
        const wouldExceedLimit =
          currentConversationTokens +
            estimatedTranslationTokens +
            estimatedReviewTokens >
          resetThreshold;

        // If text is very large or conversation history is getting too big, reset conversation
        if (wouldExceedLimit) {
          this.logger.info(
            `📝 Large conversation detected (${currentConversationTokens.toLocaleString()} tokens + ${(
              estimatedTranslationTokens + estimatedReviewTokens
            ).toLocaleString()} new tokens). Starting fresh conversation for final refinement step.`
          );
          // Reset conversation with just the system message
          const systemPrompt = prompts.system(
            this.config.targetLanguage,
            this.config.sourceLanguage,
            this.config.customInstructions,
            "apply_feedback"
          );
          this.conversation = [
            {
              role: "system",
              content: systemPrompt,
            },
          ];
          this.saveConversationHistory("Reset for final refinement");
        } else if (this.config.verbose) {
          this.logger.info(
            `📝 Continuing with existing conversation (${currentConversationTokens.toLocaleString()} tokens).`
          );
        }

        // Skip this step if external review was skipped
        let refinedFinalTranslation = finalTranslation;

        if (!this.config.skipExternalReview) {
          const finalRefinementPrompt = prompts.applyExternalFeedback(
            this.config.targetLanguage,
            this.config.sourceLanguage,
            this.config.sourceText,
            finalTranslation,
            externalReviewContent
          );

          const refinedResponse = await this.callAiService(
            finalRefinementPrompt
          );
          refinedFinalTranslation = this.xmlProcessor.extractTagContent(
            refinedResponse,
            "refined_final_translation"
          );
        }

        // Save refined final translation to file
        const refinedPath = path.join(
          this.intermediatesDir,
          "13_refined_final_translation.txt"
        );
        saveText(refinedPath, refinedFinalTranslation);
        this.outputFiles["13 Refined Final Translation"] = refinedPath;

        // Update latest translation content
        latestTranslationContent = refinedFinalTranslation;

        // Calculate metrics for this step
        const metrics = calculateMetricsForLanguage(
          refinedFinalTranslation,
          this.config.targetLanguage,
          false,
          this.sourceMetrics
        );

        this.translationMetrics.set("refined_final_translation", metrics);

        // Add to translation steps
        this.translationSteps.push("Final Refinement");
        this.succeedSpinner("✅ Final refinement completed");
        this.logger.success("Refined final translation saved to intermediates");

        // Save the final output
        saveText(this.finalOutputPath, refinedFinalTranslation);
      }

      // Save the final results
      this.saveTranslationMetrics();

      // Display final statistics
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // in seconds

      this.logger.logHeader("Translation Complete");
      this.logger.log(
        chalk.green(
          `✅ Translation successfully completed in ${formatDuration(duration)}`
        )
      );
      this.logger.log(
        chalk.cyan(`   Input tokens: ${this.totalInputTokens.toLocaleString()}`)
      );
      this.logger.log(
        chalk.cyan(
          `   Output tokens: ${this.totalOutputTokens.toLocaleString()}`
        )
      );
      this.logger.log(
        chalk.yellow(
          `💲 Estimated total cost: $${this.estimatedCost.toFixed(4)}`
        )
      );
      this.logger.log(
        chalk.green(`📁 Intermediate files saved to: ${this.intermediatesDir}`)
      );
      this.logger.log(
        chalk.green(`📄 Final output saved to: ${this.finalOutputPath}`)
      );

      // Make sure to stop the spinner when we're done
      this.stopSpinner();
    } catch (error) {
      // Make sure to stop the spinner on error
      this.stopSpinner();

      // Save whatever we have so far
      this.saveLatestTranslationOnError();
      throw error;
    }
  }

  /**
   * Save conversation history
   */
  private saveConversationHistory(label = "Update"): void {
    try {
      // Create metadata object
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

      // Save as JSON
      saveJson(this.conversationJsonPath, conversationWithMetadata);
      this.outputFiles["Conversation History (JSON)"] =
        this.conversationJsonPath;

      // Also save in human-readable format
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

      saveText(this.conversationTextPath, readableHistory);
      this.outputFiles["Conversation History (Text)"] =
        this.conversationTextPath;
    } catch (error) {
      this.logger.warn(
        `⚠️ Warning: Failed to save conversation history: ${error}`
      );
    }
  }

  /**
   * Save translation metrics
   */
  private saveTranslationMetrics(): void {
    try {
      // Convert metrics Map to an object for saving
      const metricsObject: Record<string, any> = {
        source: this.sourceMetrics,
      };

      this.translationMetrics.forEach((value, key) => {
        metricsObject[key] = value;
      });

      // Save to intermediates directory
      saveJson(this.metricsPath, metricsObject);
      this.outputFiles["Translation Metrics"] = this.metricsPath;

      this.logger.success(
        `📊 Translation metrics saved to ${this.metricsPath}`
      );
    } catch (error) {
      this.logger.warn(`⚠️ Warning: Failed to save metrics: ${error}`);
    }
  }

  /**
   * Call AI service with retry logic
   */
  private async callAiService(
    prompt: string,
    retryCount = 0,
    isExternalReview = false
  ): Promise<string> {
    let currentStepLabel: string = "Unknown Step";
    let currentStepKey: string | undefined;

    try {
      // Prepare a descriptive step name for logging
      const stepName =
        this.translationSteps.length > 0
          ? this.translationSteps[this.translationSteps.length - 1]
          : "Initial Step";

      currentStepLabel = isExternalReview
        ? `External Review`
        : `Step ${this.stepCounter} - ${stepName}`;

      // Determine current step for system prompt
      if (!isExternalReview) {
        switch (this.stepCounter) {
          case 1:
            currentStepKey = "initial_analysis";
            break;
          case 2:
            currentStepKey = "expression_exploration";
            break;
          case 3:
            currentStepKey = "cultural_discussion";
            break;
          case 4:
            currentStepKey = "title_options";
            break;
          case 5:
            currentStepKey = "first_translation";
            break;
          case 6:
            currentStepKey = "self_critique";
            break;
          case 7:
            currentStepKey = "further_refinement";
            break;
          case 8:
            currentStepKey = "final_translation";
            break;
          case 10:
            currentStepKey = "apply_feedback";
            break;
        }
      } else {
        currentStepKey = "external_review";
      }

      // For external review, start a fresh conversation to avoid biases
      let messages: ConversationMessage[] = [];

      if (isExternalReview) {
        // Create a new conversation for external review
        messages.push({
          role: "system",
          content: prompts.externalReviewSystem(
            this.config.targetLanguage,
            this.config.sourceLanguage
          ),
        });
        messages.push({
          role: "user",
          content: prompt,
        });
      } else {
        // Set step-specific system prompt
        const systemPrompt = prompts.system(
          this.config.targetLanguage,
          this.config.sourceLanguage,
          this.config.customInstructions,
          currentStepKey
        );

        // Replace the existing system message with an updated one
        if (
          this.conversation.length > 0 &&
          this.conversation[0].role === "system"
        ) {
          this.conversation[0].content = systemPrompt;
        } else {
          // If there's no system message for some reason, add one
          this.conversation.unshift({
            role: "system",
            content: systemPrompt,
          });
        }

        // Add the prompt to the main conversation
        this.conversation.push({
          role: "user",
          content: prompt,
        });
        messages = this.conversation;
      }

      // Save conversation history before API call
      if (!isExternalReview) {
        this.saveConversationHistory(currentStepLabel);
      }

      // Prepare options for AI call
      const options: AiRequestOptions = {
        modelName: this.config.modelName,
        maxOutputTokens: this.config.maxOutputTokens,
        reasoningEffort: this.config.reasoningEffort,
        temperature: 0.7,
      };

      // Call appropriate AI service
      const response = await this.aiService.generateResponse(messages, options);

      // Update token counts and cost
      this.totalInputTokens += response.inputTokens;
      this.totalOutputTokens += response.outputTokens;
      this.totalTokens = this.totalInputTokens + this.totalOutputTokens;
      this.updateCost(
        response.modelName,
        response.inputTokens,
        response.outputTokens
      );

      // Log TPS if verbose
      if (this.config.verbose) {
        const tps =
          response.duration > 0
            ? (response.outputTokens / response.duration).toFixed(2)
            : "Infinity";

        this.logger.log(chalk.cyan(`  ⚡ Tokens per second (output): ${tps}`));
        this.logger.log(
          chalk.dim(
            `     (Duration: ${response.duration.toFixed(2)}s, Output Tokens: ${
              response.outputTokens
            })`
          )
        );
      }

      // Add the response to the conversation (only for main conversation)
      if (!isExternalReview) {
        this.conversation.push({
          role: "assistant",
          content: response.content,
        });

        // Save conversation history after API call
        this.saveConversationHistory(currentStepLabel);
      }

      return response.content;
    } catch (error: any) {
      this.failSpinner(
        `API call failed (attempt ${retryCount + 1}/${
          this.config.maxRetries + 1
        })`
      );

      console.error(
        chalk.red(`❌ Error during API call (Attempt ${retryCount + 1}):`),
        error?.message || error
      );

      // Save conversation history even on error
      if (!isExternalReview) {
        this.saveConversationHistory(
          `API Call Error - ${currentStepLabel} - Attempt ${retryCount + 1}`
        );
      }

      // Check if this is a context length error
      const isContextLengthError =
        error?.message?.includes("context length") ||
        error?.message?.includes("maximum context length") ||
        error?.message?.includes("tokens exceeds the model's context length") ||
        error?.code === "context_length_exceeded";

      if (isContextLengthError && !isExternalReview) {
        this.logger.warn(
          "🔄 Context length exceeded. Adjusting conversation history..."
        );

        // Get system message
        const systemMessage = this.conversation[0];

        // Define model context limits (same as in manageConversationContext)
        const modelContextLimits: Record<string, number> = {
          // OpenAI models with 128K context window
          "gpt-4.5-preview": 128000,
          "gpt-4.5": 128000,
          "gpt-4o": 128000,
          "gpt-4o-mini": 128000,
          "gpt-4": 128000,

          // Claude models
          "claude-3-7-sonnet-latest": 128000,
          "claude-3-opus-20240229": 200000,
          "claude-3-sonnet-20240229": 128000,
          "claude-3-haiku-20240307": 48000,
          "claude-3-5-sonnet-20240620": 128000,
        };

        // Common model prefixes to check
        const prefixMap = {
          "gpt-4.5": 128000,
          "gpt-4o": 128000,
          "gpt-4": 128000,
          "claude-3-opus": 200000,
          "claude-3-sonnet": 128000,
          "claude-3-haiku": 48000,
          "claude-3.5": 128000,
          "claude-3-7": 128000,
        };

        let modelContextLimit = 0;

        // Try exact match first
        modelContextLimit = modelContextLimits[this.config.modelName] || 0;

        // If no exact match, try prefix matching
        if (!modelContextLimit) {
          for (const [prefix, limit] of Object.entries(prefixMap)) {
            if (this.config.modelName.startsWith(prefix)) {
              modelContextLimit = limit;
              this.logger.info(
                `📚 Matched model ${
                  this.config.modelName
                } to prefix ${prefix} with ${limit.toLocaleString()} context limit`
              );
              break;
            }
          }
        }

        if (!modelContextLimit) {
          modelContextLimit = 16384; // Default conservative limit
          this.logger.warn(
            `⚠️ Unknown model ${
              this.config.modelName
            }, using conservative default context limit of ${modelContextLimit.toLocaleString()} tokens for error recovery`
          );
        }

        // For all models, try to keep more context by removing some middle messages
        if (this.conversation.length > 6) {
          this.logger.info(
            "📝 Using selective pruning for context length error..."
          );

          // Keep system message, first user message, and last 2-3 exchanges
          const systemMessage = this.conversation[0];
          const firstUserMessage = this.conversation.find(
            (m) => m.role === "user"
          );

          // Keep just the latest user message (the prompt we just tried to use)
          const latestUserMessage = this.conversation
            .filter((m) => m.role === "user")
            .slice(-1)[0];

          // Reset conversation to just the essential messages
          if (firstUserMessage && firstUserMessage !== latestUserMessage) {
            this.conversation = [
              systemMessage,
              firstUserMessage,
              latestUserMessage,
            ];
          } else {
            this.conversation = [systemMessage, latestUserMessage];
          }

          this.logger.info(
            `📝 Pruned conversation to ${this.conversation.length} messages, keeping essential context`
          );
        } else {
          // For smaller conversations, just keep system + current prompt
          const latestUserMessage =
            this.conversation[this.conversation.length - 1];

          this.conversation = [systemMessage, latestUserMessage];

          this.logger.info(
            "📝 Conversation history aggressively pruned to only system message and current prompt"
          );
        }

        this.saveConversationHistory("Pruned for context length error");
      }

      if (retryCount < this.config.maxRetries) {
        this.logger.warn(
          `  ↪ Retrying in ${this.config.retryDelay / 1000} seconds...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, this.config.retryDelay)
        );

        this.startSpinnerWithTimer("Retrying API call");
        return this.callAiService(prompt, retryCount + 1, isExternalReview);
      }

      // Make sure to stop the spinner when maximum retries are reached
      this.stopSpinner();
      this.logger.error("❌ Error calling AI API after maximum retries");
      throw error;
    }
  }

  /**
   * Update cost calculations
   */
  private updateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    try {
      const costResult = this.aiService.calculateCost(
        model,
        inputTokens,
        outputTokens
      );
      this.estimatedCost += costResult.totalCost;

      if (this.config.verbose) {
        this.logger.log(
          chalk.dim(
            `  💲 Cost for this call ($${costResult.totalCost.toFixed(
              5
            )}): Input $${costResult.inputCost.toFixed(
              5
            )} (${inputTokens} tokens) + Output $${costResult.outputCost.toFixed(
              5
            )} (${outputTokens} tokens)`
          )
        );
      }
    } catch (error) {
      this.logger.warn(`⚠️ Error calculating cost: ${error}`);
    }
  }

  /**
   * Display source metrics
   */
  private displaySourceMetrics(): void {
    this.logger.log(chalk.cyan(`📏 Source text metrics:`));

    if (this.config.sourceLanguage) {
      this.logger.log(chalk.cyan(`   Language: ${this.config.sourceLanguage}`));
    } else {
      this.logger.log(chalk.cyan(`   Language: (Auto-detected/Not specified)`));
    }

    this.logger.log(
      chalk.cyan(
        `   Word count: ${this.sourceMetrics.sourceWordCount.toLocaleString()}`
      )
    );

    this.logger.log(
      chalk.cyan(
        `   Character count: ${this.sourceMetrics.sourceCharCount.toLocaleString()}`
      )
    );

    this.logger.log(
      chalk.cyan(
        `   Estimated reading time: ${formatTime(
          this.sourceMetrics.estimatedReadingTime
        )}`
      )
    );
  }

  /**
   * Display metrics for a translation step
   */
  private displayMetrics(label: string, metrics: TranslationMetrics): void {
    this.logger.log(chalk.cyan(`📏 ${label} metrics:`));

    this.logger.log(
      chalk.cyan(`   Word count: ${metrics.targetWordCount.toLocaleString()}`)
    );

    this.logger.log(
      chalk.cyan(
        `   Character count: ${metrics.targetCharCount.toLocaleString()}`
      )
    );

    this.logger.log(
      chalk.cyan(
        `   Estimated reading time: ${formatTime(metrics.estimatedReadingTime)}`
      )
    );
  }

  /**
   * Display comparison with source text
   */
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

    this.logger.log(chalk.magenta(`📊 Comparison with source text:`));

    this.logger.log(
      chalk.magenta(
        `   Word count ratio: ${wordCountRatio}${
          validSource ? "%" : ""
        } of source`
      )
    );

    this.logger.log(
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

    const wordBar = createProgressBar(ratioValue, validSource);
    this.logger.log(chalk.magenta(`   Word ratio: ${wordBar}`));
  }

  /**
   * Save the latest translation on error
   */
  public saveLatestTranslationOnError(): void {
    const translationFileOrder = [
      "13_refined_final_translation.txt",
      "11_final_translation.txt",
      "09_further_improved_translation.txt",
      "07_improved_translation.txt",
      "05_first_translation.txt",
    ];

    let latestFileFound: string | null = findLatestFile(
      this.intermediatesDir,
      translationFileOrder
    );

    if (latestFileFound) {
      try {
        const content = loadText(latestFileFound);
        saveText(this.finalOutputPath, content);

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

  /**
   * Start spinner with elapsed time tracking
   */
  private startSpinnerWithTimer(message: string): void {
    // Clear any existing interval
    this.clearSpinnerInterval();

    // Start spinner with initial message
    this.spinner.start(message);

    // Record start time
    this.spinnerStartTime = performance.now();

    // Set up interval to update spinner text with elapsed time
    this.spinnerInterval = setInterval(() => {
      const elapsedSeconds = (performance.now() - this.spinnerStartTime) / 1000;
      this.spinner.text = `${message} (${elapsedSeconds.toFixed(1)}s)`;
    }, 100); // Update every 100ms for smooth display
  }

  /**
   * Clear spinner interval
   */
  private clearSpinnerInterval(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }

  /**
   * Stop spinner and clear interval
   */
  private stopSpinner(): void {
    this.clearSpinnerInterval();
    this.spinner.stop();
  }

  /**
   * Succeed spinner and clear interval
   */
  private succeedSpinner(message: string): void {
    this.clearSpinnerInterval();
    const elapsedSeconds = (performance.now() - this.spinnerStartTime) / 1000;
    this.spinner.succeed(`${message} (${elapsedSeconds.toFixed(1)}s)`);
  }

  /**
   * Fail spinner and clear interval
   */
  private failSpinner(message: string): void {
    this.clearSpinnerInterval();
    const elapsedSeconds = (performance.now() - this.spinnerStartTime) / 1000;
    this.spinner.fail(`${message} (${elapsedSeconds.toFixed(1)}s)`);
  }

  private manageConversationContext(modelName: string): void {
    // Skip for external review which uses a fresh conversation
    if (this.conversation.length <= 2) return;

    // Estimate token count in current conversation
    let totalEstimatedTokens = 0;

    // Rough token estimation (4 chars ≈ 1 token on average)
    for (const message of this.conversation) {
      totalEstimatedTokens += Math.ceil(message.content.length / 4);
    }

    // Define model context limits (input + output tokens)
    // Different from output limits which restrict the size of model responses
    const modelContextLimits: Record<string, number> = {
      // OpenAI models with 128K context window
      "gpt-4.5-preview": 128000,
      "gpt-4.5": 128000,
      "gpt-4o": 128000,
      "gpt-4o-mini": 128000,
      "gpt-4": 128000,

      // Claude models
      "claude-3-7-sonnet-latest": 128000,
      "claude-3-opus-20240229": 200000,
      "claude-3-sonnet-20240229": 128000,
      "claude-3-haiku-20240307": 48000,
      "claude-3-5-sonnet-20240620": 128000,
    };

    // Determine model context limit
    let modelContextLimit = 0;

    // Try exact match first
    modelContextLimit = modelContextLimits[modelName] || 0;

    // If no exact match, try prefix matching
    if (!modelContextLimit) {
      // Common model prefixes to check
      const prefixMap = {
        "gpt-4.5": 128000,
        "gpt-4o": 128000,
        "gpt-4": 128000,
        "claude-3-opus": 200000,
        "claude-3-sonnet": 128000,
        "claude-3-haiku": 48000,
        "claude-3.5": 128000,
        "claude-3-7": 128000,
      };

      for (const [prefix, limit] of Object.entries(prefixMap)) {
        if (modelName.startsWith(prefix)) {
          modelContextLimit = limit;
          if (this.config.verbose) {
            this.logger.info(
              `📚 Matched model ${modelName} to prefix ${prefix} with ${limit.toLocaleString()} context limit`
            );
          }
          break;
        }
      }
    }

    // Set a reasonable default if no match found (16K is very conservative)
    if (!modelContextLimit) {
      modelContextLimit = 16384;
      this.logger.warn(
        `⚠️ Unknown model ${modelName}, using conservative default context limit of ${modelContextLimit.toLocaleString()} tokens`
      );
    } else if (this.config.verbose) {
      this.logger.info(
        `📚 Using context limit of ${modelContextLimit.toLocaleString()} tokens for model ${modelName}`
      );
    }

    // Use different thresholds based on model size
    // For all models, use 90% threshold for large context models
    const thresholdPercentage = 0.9;
    const tokenThreshold = Math.floor(modelContextLimit * thresholdPercentage);

    // Show current token usage in verbose mode
    if (this.config.verbose) {
      const usagePercentage = (
        (totalEstimatedTokens / modelContextLimit) *
        100
      ).toFixed(1);
      this.logger.info(
        `ℹ️ Current conversation size: ~${totalEstimatedTokens.toLocaleString()} tokens (${usagePercentage}% of ${modelContextLimit.toLocaleString()} context limit)`
      );
    }

    // Warning zone: 70% of limit
    const warningThreshold = Math.floor(modelContextLimit * 0.7);
    if (
      totalEstimatedTokens > warningThreshold &&
      totalEstimatedTokens <= tokenThreshold
    ) {
      this.logger.warn(
        `⚠️ Approaching context limit (est. ${totalEstimatedTokens.toLocaleString()} tokens, ${(
          (totalEstimatedTokens / modelContextLimit) *
          100
        ).toFixed(1)}% of limit). No trimming yet.`
      );
    }

    // If approaching limit, trim conversation history
    if (totalEstimatedTokens > tokenThreshold) {
      this.logger.warn(
        `⚠️ Reached token threshold (est. ${totalEstimatedTokens.toLocaleString()} tokens, ${(
          (totalEstimatedTokens / modelContextLimit) *
          100
        ).toFixed(
          1
        )}% of ${modelContextLimit.toLocaleString()} context limit). Trimming conversation history...`
      );

      // Keep system message and more recent exchanges
      const systemMessage = this.conversation[0];

      // Keep more history since all models have large contexts
      const messagesToKeep = 10; // 5 exchanges (10 messages)
      const recentMessages = this.conversation.slice(-messagesToKeep);

      // Reset conversation with system message and recent exchanges
      this.conversation = [systemMessage, ...recentMessages];

      // Calculate new estimate
      let newEstimate = 0;
      for (const message of this.conversation) {
        newEstimate += Math.ceil(message.content.length / 4);
      }

      this.logger.info(
        `ℹ️ Trimmed conversation history to ${
          this.conversation.length
        } messages (est. ${newEstimate.toLocaleString()} tokens, ${(
          (newEstimate / modelContextLimit) *
          100
        ).toFixed(1)}% of limit)`
      );
    }
  }
}
