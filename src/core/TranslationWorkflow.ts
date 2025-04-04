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
import * as fs from "fs";

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

        // Validate and adjust the stepCounter based on actually completed output files
        this.adjustStepCounter();

        this.logger.success(
          `🔄 Resuming translation workflow from step ${
            this.stepCounter
          } (${this.getStepLabel(this.stepCounter)})`
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
   * Adjust the step counter based on completed output files
   * This ensures we don't skip steps if they were interrupted
   */
  private adjustStepCounter(): void {
    // Define expected output files for each step
    const stepFiles = {
      1: "01_initial_analysis.txt",
      2: "02_expression_exploration.txt",
      3: "03_cultural_adaptation.txt",
      4: "04_title_inspiration.txt",
      5: "05_first_translation.txt",
      6: "07_improved_translation.txt", // Note: the file number doesn't match step number
      7: "09_further_improved_translation.txt",
      8: "11_final_translation.txt",
      9: "12_external_review.txt",
      10: "13_refined_final_translation.txt",
    };

    // Check if the last completed step has its output file
    // If not, we need to repeat that step
    const currentStepFile = stepFiles[this.stepCounter];
    if (currentStepFile) {
      const filePath = path.join(this.intermediatesDir, currentStepFile);
      // If the file doesn't exist or is empty, we need to repeat this step
      if (!fs.existsSync(filePath) || loadText(filePath, "").length === 0) {
        // If this is step 1, keep it at 1
        // Otherwise, go back one step
        if (this.stepCounter > 1) {
          this.stepCounter = this.stepCounter - 1;
          this.logger.warn(
            `⚠️ Previous step ${
              this.stepCounter + 1
            } was incomplete. Resuming from step ${
              this.stepCounter
            } (${this.getStepLabel(this.stepCounter)})`
          );
        }
      }
    }
  }

  /**
   * Get a human-readable label for a step number
   */
  private getStepLabel(stepNumber: number): string {
    const stepLabels = [
      "Initial Setup",
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

    return stepLabels[stepNumber] || "Unknown Step";
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
      // Use an execution loop to allow steps to be repeated if needed
      let continueExecution = true;
      while (continueExecution) {
        continueExecution = false; // Will be set to true if we need to repeat a step

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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            this.logger.warn(
              `⚠️ Repeating step 1 due to missing dependencies for step 2`
            );
            this.stepCounter = 1;
            continueExecution = true;
            continue;
          }

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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            this.logger.warn(
              `⚠️ Repeating step 2 due to missing dependencies for step 3`
            );
            this.stepCounter = 2;
            continueExecution = true;
            continue;
          }

          this.startSpinnerWithTimer(
            "Step 3/10: Discussing cultural adaptation"
          );

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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            this.logger.warn(
              `⚠️ Repeating step 3 due to missing dependencies for step 4`
            );
            this.stepCounter = 3;
            continueExecution = true;
            continue;
          }

          this.startSpinnerWithTimer(
            "Step 4/10: Exploring title & inspiration"
          );

          const titleInspirationPrompt = prompts.titleAndInspirationExploration(
            this.config.sourceText,
            this.config.targetLanguage
          );

          const titleResponse = await this.callAiService(
            titleInspirationPrompt
          );
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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            this.logger.warn(
              `⚠️ Repeating step 4 due to missing dependencies for step 5`
            );
            this.stepCounter = 4;
            continueExecution = true;
            continue;
          }

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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            this.logger.warn(
              `⚠️ Repeating step 5 due to missing dependencies for step 6`
            );
            this.stepCounter = 5;
            continueExecution = true;
            continue;
          }

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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            this.logger.warn(
              `⚠️ Repeating step 6 due to missing dependencies for step 7`
            );
            this.stepCounter = 6;
            continueExecution = true;
            continue;
          }

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
          const furtherImprovedTranslation =
            this.xmlProcessor.extractTagContent(
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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            this.logger.warn(
              `⚠️ Repeating step 7 due to missing dependencies for step 8`
            );
            this.stepCounter = 7;
            continueExecution = true;
            continue;
          }

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

          // If text is very large, reset conversation to avoid context limits
          if (estimatedSourceTokens + estimatedTranslationTokens > 12000) {
            this.logger.info(
              "📝 Large translation detected. Starting fresh conversation for final translation step."
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
          }

          const finalTranslationPrompt = prompts.finalTranslation(
            this.config.targetLanguage,
            this.config.sourceLanguage,
            this.config.sourceText,
            prevTranslation
          );

          const finalResponse = await this.callAiService(
            finalTranslationPrompt
          );
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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            this.logger.warn(
              `⚠️ Repeating step 8 due to missing dependencies for step 9`
            );
            this.stepCounter = 8;
            continueExecution = true;
            continue;
          }

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

          // Validate dependencies
          if (!this.validateStepDependencies(this.stepCounter)) {
            if (!this.config.skipExternalReview) {
              this.logger.warn(
                `⚠️ Repeating step 9 due to missing dependencies for step 10`
              );
              this.stepCounter = 9;
            } else {
              this.logger.warn(
                `⚠️ Repeating step 8 due to missing dependencies for step 10`
              );
              this.stepCounter = 8;
            }
            continueExecution = true;
            continue;
          }

          this.startSpinnerWithTimer("Step 10/10: Applying final refinements");

          // Get the final translation content
          const finalTranslationPath = path.join(
            this.intermediatesDir,
            "11_final_translation.txt"
          );
          const finalTranslation = loadText(finalTranslationPath, "");

          // For final refinement, reset conversation to avoid context limits with long texts
          const estimatedTranslationTokens = Math.ceil(
            finalTranslation.length / 4
          );
          const estimatedReviewTokens = externalReviewContent
            ? Math.ceil(externalReviewContent.length / 4)
            : 0;

          // If text is very large, reset conversation
          if (estimatedTranslationTokens + estimatedReviewTokens > 10000) {
            this.logger.info(
              "📝 Large translation detected. Starting fresh conversation for final refinement step."
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
          this.logger.success(
            "Refined final translation saved to intermediates"
          );

          // Save the final output
          saveText(this.finalOutputPath, refinedFinalTranslation);
        }

        // If we've completed all steps, break the loop
        if (!continueExecution) {
          break;
        }
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
        // Check if we need to manage conversation context to avoid token limits
        this.manageConversationContext(this.config.modelName);

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
        error?.code === "context_length_exceeded";

      if (isContextLengthError && !isExternalReview) {
        this.logger.warn(
          "🔄 Context length exceeded. Aggressively trimming conversation history..."
        );

        // Get system message
        const systemMessage = this.conversation[0];

        // Get latest user message (the prompt we just tried to use)
        const latestUserMessage =
          this.conversation[this.conversation.length - 1];

        // Reset conversation to just system + prompt
        this.conversation = [systemMessage, latestUserMessage];

        this.logger.info(
          "📝 Conversation history pruned to only system message and current prompt"
        );
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

        // Determine which step we were on and what step to resume from
        const currentStepLabel = this.getStepLabel(this.stepCounter);
        const recommendedNextStep = this.stepCounter > 0 ? this.stepCounter : 1;

        console.log(
          chalk.yellow(
            `⚠️ Process interrupted during step ${this.stepCounter} (${currentStepLabel}).`
          )
        );
        console.log(
          chalk.yellow(
            `   Latest available translation (${path.basename(
              latestFileFound
            )}) saved to: ${this.finalOutputPath}`
          )
        );
        console.log(
          chalk.green(
            `   To resume, run the command again. It will automatically continue from step ${recommendedNextStep}.`
          )
        );

        // Additional check to verify the step file exists and is not empty
        if (this.stepCounter > 0) {
          const stepDependencies = {
            6: "05_first_translation.txt",
            7: "07_improved_translation.txt",
            8: "09_further_improved_translation.txt",
            9: "11_final_translation.txt",
            10: "11_final_translation.txt",
          };

          const dependencyFile =
            stepDependencies[this.stepCounter as keyof typeof stepDependencies];
          if (dependencyFile) {
            const filePath = path.join(this.intermediatesDir, dependencyFile);
            if (
              !fs.existsSync(filePath) ||
              loadText(filePath, "").length === 0
            ) {
              console.log(
                chalk.red(
                  `   Warning: Required file for next step (${dependencyFile}) is missing or empty.`
                )
              );
              console.log(
                chalk.red(
                  `   You may need to manually reset to an earlier step using the --step option.`
                )
              );
            }
          }
        }
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
          `⚠️ Process interrupted at step ${this.stepCounter}. No intermediate translation files found to save.`
        )
      );
      console.log(chalk.green(`   To restart, run the command again.`));
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

  /**
   * Manage conversation context to avoid token limits
   * Keeps system message and most recent exchanges, removing older history when needed
   */
  private manageConversationContext(modelName: string): void {
    // Skip for external review which uses a fresh conversation
    if (this.conversation.length <= 2) return;

    // Estimate token count in current conversation
    let totalEstimatedTokens = 0;

    // Rough token estimation (4 chars ≈ 1 token on average)
    for (const message of this.conversation) {
      totalEstimatedTokens += Math.ceil(message.content.length / 4);
    }

    // Get model limit
    const modelLimits: Record<string, number> = {
      "gpt-4.5-preview": 16384,
      "gpt-4o": 16384,
      "gpt-4o-mini": 16384,
      "claude-3-7-sonnet-latest": 128000,
    };

    // Determine model limit
    let modelLimit = 0;

    // Try exact match first
    modelLimit = modelLimits[modelName] || 0;

    // If no exact match, try prefix matching
    if (!modelLimit) {
      for (const [modelPrefix, limit] of Object.entries(modelLimits)) {
        if (modelName.startsWith(modelPrefix)) {
          modelLimit = limit;
          break;
        }
      }
    }

    // Set a reasonable default if no match found
    if (!modelLimit) modelLimit = 16384;

    // Set threshold (80% of limit)
    const tokenThreshold = Math.floor(modelLimit * 0.8);

    // If approaching limit, trim conversation history
    if (totalEstimatedTokens > tokenThreshold) {
      this.logger.warn(
        `⚠️ Approaching token limit (est. ${totalEstimatedTokens} tokens). Trimming conversation history...`
      );

      // Keep system message and most recent exchanges
      const systemMessage = this.conversation[0];
      const recentMessages = this.conversation.slice(-4); // Keep last 2 exchanges (4 messages)

      // Reset conversation with system message and recent exchanges
      this.conversation = [systemMessage, ...recentMessages];

      // Calculate new estimate
      let newEstimate = 0;
      for (const message of this.conversation) {
        newEstimate += Math.ceil(message.content.length / 4);
      }

      this.logger.info(
        `ℹ️ Trimmed conversation history to ${this.conversation.length} messages (est. ${newEstimate} tokens)`
      );
    }
  }

  /**
   * Validate that dependencies for a step exist
   * Returns true if dependencies exist, false otherwise
   */
  private validateStepDependencies(stepNumber: number): boolean {
    // Define file dependencies for each step
    const stepDependencies: Record<number, string[]> = {
      // Step 2+ don't have critical file dependencies from previous steps
      // The source text is all they need, which is passed directly
      2: [],
      3: [],
      4: [],
      5: [],
      6: ["05_first_translation.txt"], // Step 6 needs output from step 5
      7: ["07_improved_translation.txt"], // Step 7 needs output from step 6
      8: ["09_further_improved_translation.txt"], // Step 8 needs output from step 7
      9: ["11_final_translation.txt"], // Step 9 needs output from step 8
      10: ["11_final_translation.txt"], // Step 10 needs output from step 8
    };

    // If step has no dependencies, it's valid
    if (
      !stepDependencies[stepNumber] ||
      stepDependencies[stepNumber].length === 0
    ) {
      return true;
    }

    // Check if all dependencies exist and have content
    for (const file of stepDependencies[stepNumber]) {
      const filePath = path.join(this.intermediatesDir, file);
      if (!fs.existsSync(filePath)) {
        this.logger.warn(
          `⚠️ Missing dependency for step ${stepNumber}: ${file} not found`
        );
        return false;
      }

      const content = loadText(filePath, "");
      if (content.length === 0) {
        this.logger.warn(
          `⚠️ Missing dependency for step ${stepNumber}: ${file} is empty`
        );
        return false;
      }
    }

    return true;
  }
}
