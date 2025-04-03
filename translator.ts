import * as fs from "fs";
import * as path from "path";
import { OpenAI } from "openai";
import { Command } from "commander";
import * as dotenv from "dotenv";
import chalk from "chalk";
import ora from "ora";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define types
interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TranslationConfig {
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  outputDir: string;
  modelName: string;
  verbose: boolean;
  maxRetries: number;
  retryDelay: number;
}

// Translation workflow class
class TranslationWorkflow {
  private conversation: ConversationMessage[] = [];
  private config: TranslationConfig;
  private spinner = ora();
  private totalTokens = 0;
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
  private outputFiles: { [key: string]: string } = {};

  constructor(config: TranslationConfig) {
    this.config = config;

    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Initialize conversation with system prompt
    this.conversation.push({
      role: "system",
      content: `You are an expert literary translator with deep fluency in ${config.sourceLanguage} and ${config.targetLanguage}.
Your goal is to create a high-quality translation that preserves the original's tone, style, literary devices,
cultural nuances, and overall impact. You prioritize readability and naturalness in the target language while
staying faithful to the source text's meaning and intention.

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

Your tone should be conversational and thoughtful, as if you're discussing the translation process with a colleague.
Think deeply about cultural context, idiomatic expressions, and literary devices that would resonate with native
${config.targetLanguage} speakers.

Work through the translation step by step, maintaining the voice and essence of the original while making it
feel naturally written in ${config.targetLanguage}.`,
    });
  }

  // Main execution method
  public async execute(): Promise<void> {
    this.logHeader("Starting Translation Workflow");
    this.log(
      chalk.blue(
        `📄 Translating from ${this.config.sourceLanguage} to ${this.config.targetLanguage}`
      )
    );

    try {
      // Record start time for tracking duration
      const startTime = Date.now();

      // Step 1: Initial analysis of what to preserve
      await this.initialAnalysis();

      // Step 2: Exploring expression in target language
      await this.expressionExploration();

      // Step 3: Discussion on tone, honorifics, and cultural adaptation
      await this.toneAndCulturalDiscussion();

      // Step 4: Title translation and literary inspiration
      await this.titleAndInspirationExploration();

      // Step 5: First translation attempt
      await this.firstTranslationAttempt();

      // Step 6: Self-critique and improvement (first iteration)
      await this.selfCritiqueAndRefinement();

      // Step 7: Further review and improvement (second iteration)
      await this.furtherRefinement();

      // Step 8: Final translation with comprehensive review
      const finalTranslation = await this.finalTranslation();

      // Save the translation
      this.saveTranslation(finalTranslation);

      // Save the full conversation history
      this.saveConversationHistory();

      // Record and display completion metrics
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // in seconds

      this.logHeader("Translation Complete");
      this.log(
        chalk.green(
          `✅ Translation successfully completed in ${duration.toFixed(
            2
          )} seconds`
        )
      );
      this.log(
        chalk.yellow(
          `💰 Total tokens used: ${this.totalTokens.toLocaleString()}`
        )
      );
      const estimatedCost = (this.totalTokens / 1000) * 0.002; // Approximate cost calculation
      this.log(chalk.yellow(`💲 Estimated cost: $${estimatedCost.toFixed(4)}`));
      this.log(
        chalk.green(`📁 Output files saved to: ${this.config.outputDir}`)
      );

      // Display all output files
      this.log(chalk.magenta("\n📋 Generated Files:"));
      Object.entries(this.outputFiles).forEach(([key, filePath]) => {
        this.log(chalk.cyan(`   ${key}: ${filePath}`));
      });
    } catch (error) {
      this.spinner.fail("Translation process failed");
      console.error(chalk.red("❌ Error during translation:"), error);
      // Save conversation history even if there's an error
      this.saveConversationHistory();
      throw error;
    }
  }

  // Step 1: Initial analysis
  private async initialAnalysis(): Promise<void> {
    this.translationSteps.push("Initial Analysis");
    this.spinner.start(chalk.blue("📊 Analyzing source text"));

    const prompt = `I'd like your help translating a text from ${this.config.sourceLanguage} to ${this.config.targetLanguage}.
Before we start, could you analyze what we'll need to preserve in terms of tone, style, meaning, and cultural nuances?

Here's the text:

${this.config.sourceText}

Please analyze this text thoughtfully. What are the key elements that make this text distinctive? What tone, voice,
argument structure, rhetorical devices, and cultural references should we be careful to preserve in translation?

Remember to put your analysis in <analysis> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(chalk.green("📊 Initial analysis completed"));

    // Extract analysis for later use
    const analysisMatch = response.match(/<analysis>([\s\S]*)<\/analysis>/);
    const analysis = analysisMatch ? analysisMatch[1].trim() : response;

    // Save the analysis
    const analysisPath = path.join(
      this.config.outputDir,
      "01_initial_analysis.txt"
    );
    fs.writeFileSync(analysisPath, analysis);
    this.outputFiles["Initial Analysis"] = analysisPath;

    this.log(chalk.green("  ↪ Analysis saved to disk"));
  }

  // Step 2: Exploring expression in target language
  private async expressionExploration(): Promise<void> {
    this.translationSteps.push("Expression Exploration");
    this.spinner.start(
      chalk.blue("🔍 Exploring expression in target language")
    );

    const prompt = `Now that we've analyzed the text, I'm curious about how we could express these elements in ${this.config.targetLanguage}.

How might we capture the tone and style of the original in ${this.config.targetLanguage}? Are there particular expressions,
idioms, or literary devices in ${this.config.targetLanguage} that could help convey the same feeling and impact?

What about cultural references or metaphors? Could you suggest some ways to handle those elements that would resonate
with ${this.config.targetLanguage} speakers while staying true to the original's intent?

I'd love some specific examples or suggestions that we could use in our translation. Please include your thoughts
in <expression_exploration> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(chalk.green("🔍 Expression exploration completed"));

    // Extract exploration content
    const explorationMatch = response.match(
      /<expression_exploration>([\s\S]*)<\/expression_exploration>/
    );
    const exploration = explorationMatch
      ? explorationMatch[1].trim()
      : response;

    // Save the exploration
    const explorationPath = path.join(
      this.config.outputDir,
      "02_expression_exploration.txt"
    );
    fs.writeFileSync(explorationPath, exploration);
    this.outputFiles["Expression Exploration"] = explorationPath;

    this.log(chalk.green("  ↪ Expression exploration saved to disk"));
  }

  // Step 3: Discussion on tone, honorifics, and cultural adaptation
  private async toneAndCulturalDiscussion(): Promise<void> {
    this.translationSteps.push("Cultural Adaptation Discussion");
    this.spinner.start(
      chalk.blue("🏮 Discussing cultural adaptation and tone")
    );

    const prompt = `Let's discuss some specific aspects of our translation approach:

What do you think would be the most appropriate tone or level of honorifics to use in this ${this.config.targetLanguage} translation?
I understand there might be cultural differences to consider. What would feel most natural and appropriate given the content and style of the original?

Are there any cultural references or allegories in ${this.config.targetLanguage} that might help convey the essence of certain passages,
even if they slightly modify the literal meaning? I'm fine with creative adaptation as long as the core message is preserved.

How can we ensure the translation maintains a distinctive personal voice, rather than sounding generic?
What would you say is unique about the original's voice, and how could we capture that in ${this.config.targetLanguage}?

Please share your thoughts in <cultural_discussion> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green("🏮 Cultural adaptation discussion completed")
    );

    // Extract discussion content
    const discussionMatch = response.match(
      /<cultural_discussion>([\s\S]*)<\/cultural_discussion>/
    );
    const discussion = discussionMatch ? discussionMatch[1].trim() : response;

    // Save the discussion
    const discussionPath = path.join(
      this.config.outputDir,
      "03_cultural_discussion.txt"
    );
    fs.writeFileSync(discussionPath, discussion);
    this.outputFiles["Cultural Discussion"] = discussionPath;

    this.log(chalk.green("  ↪ Cultural adaptation discussion saved to disk"));
  }

  // Step 4: Title translation and literary inspiration
  private async titleAndInspirationExploration(): Promise<void> {
    this.translationSteps.push("Title & Inspiration Exploration");
    this.spinner.start(
      chalk.blue("✨ Exploring title translation and literary inspiration")
    );

    const prompt = `Let's talk about a few more aspects before we start the actual translation:

What might be a good way to translate the title into ${this.config.targetLanguage}? Could you suggest a few options
that would capture the essence and appeal while being culturally appropriate?

Are there any ${this.config.targetLanguage} writers or texts with a similar style or thematic focus that might
serve as inspiration for our translation approach? I'd find it helpful to know if this reminds you of particular writers or works.

What common pitfalls should we be careful to avoid when translating this type of content from ${this.config.sourceLanguage}
to ${this.config.targetLanguage}? Any particular challenges or mistakes that translators often make?

Please share your thoughts in <title_options> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green("✨ Title and inspiration exploration completed")
    );

    // Extract title options content
    const optionsMatch = response.match(
      /<title_options>([\s\S]*)<\/title_options>/
    );
    const options = optionsMatch ? optionsMatch[1].trim() : response;

    // Save the title options
    const optionsPath = path.join(
      this.config.outputDir,
      "04_title_options.txt"
    );
    fs.writeFileSync(optionsPath, options);
    this.outputFiles["Title Options"] = optionsPath;

    this.log(chalk.green("  ↪ Title options and inspiration saved to disk"));
  }

  // Step 5: First translation attempt
  private async firstTranslationAttempt(): Promise<void> {
    this.translationSteps.push("First Translation");
    this.spinner.start(chalk.blue("📝 Creating first draft translation"));

    const prompt = `I think we're ready to start translating! Based on our discussions so far, could you create
a first draft translation of the text into ${this.config.targetLanguage}?

Here's the original text again for reference:

${this.config.sourceText}

Please apply all the insights we've discussed about tone, style, cultural adaptation, and voice.
Remember to put your translation in <first_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(chalk.green("📝 First draft translation completed"));

    // Extract first translation
    const translationMatch = response.match(
      /<first_translation>([\s\S]*)<\/first_translation>/
    );
    const firstTranslation = translationMatch
      ? translationMatch[1].trim()
      : response;

    // Save the first translation
    const translationPath = path.join(
      this.config.outputDir,
      "05_first_translation.txt"
    );
    fs.writeFileSync(translationPath, firstTranslation);
    this.outputFiles["First Translation"] = translationPath;

    this.log(chalk.green("  ↪ First draft translation saved to disk"));
  }

  // Step 6: Self-critique and first refinement
  private async selfCritiqueAndRefinement(): Promise<void> {
    this.translationSteps.push("Self-Critique & First Refinement");
    this.spinner.start(
      chalk.blue("🔄 Performing self-critique and first refinement")
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
the issues you identified. This kind of iterative improvement through critique is often how the
best translations develop.

Please put your critique in <critique> tags and your improved translation in <improved_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green("🔄 Self-critique and first refinement completed")
    );

    // Extract critique
    const critiqueMatch = response.match(/<critique>([\s\S]*)<\/critique>/);
    const critique = critiqueMatch ? critiqueMatch[1].trim() : "";

    // Extract improved translation
    const improvedMatch = response.match(
      /<improved_translation>([\s\S]*)<\/improved_translation>/
    );
    const improvedTranslation = improvedMatch
      ? improvedMatch[1].trim()
      : response;

    // Save the critique
    const critiquePath = path.join(
      this.config.outputDir,
      "06_first_critique.txt"
    );
    fs.writeFileSync(critiquePath, critique);
    this.outputFiles["First Critique"] = critiquePath;

    // Save the improved translation
    const improvedPath = path.join(
      this.config.outputDir,
      "07_improved_translation.txt"
    );
    fs.writeFileSync(improvedPath, improvedTranslation);
    this.outputFiles["Improved Translation"] = improvedPath;

    this.log(
      chalk.green("  ↪ Critique and improved translation saved to disk")
    );
  }

  // Step 7: Further review and second refinement
  private async furtherRefinement(): Promise<void> {
    this.translationSteps.push("Second Refinement");
    this.spinner.start(chalk.blue("🔄 Performing second round of refinement"));

    const prompt = `As you mentioned before, the best way to write is often through critique and rewrite.
With fresh eyes, could you take another look at our current translation?

What aspects still need improvement? Are there places where the language could be more natural,
the cultural adaptation more nuanced, or the translation more faithful to the original's spirit?

I find that each revision helps us discover new things and see the text from different angles.
Your insights on what could still be enhanced would be invaluable.

After your critique, please provide another refined version of the translation that incorporates
these new insights and improvements.

Please put your second critique in <second_critique> tags and your further improved translation
in <further_improved_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(
      chalk.green("🔄 Second round of refinement completed")
    );

    // Extract second critique
    const critiqueMatch = response.match(
      /<second_critique>([\s\S]*)<\/second_critique>/
    );
    const critique = critiqueMatch ? critiqueMatch[1].trim() : "";

    // Extract further improved translation
    const furtherImprovedMatch = response.match(
      /<further_improved_translation>([\s\S]*)<\/further_improved_translation>/
    );
    const furtherImprovedTranslation = furtherImprovedMatch
      ? furtherImprovedMatch[1].trim()
      : response;

    // Save the second critique
    const critiquePath = path.join(
      this.config.outputDir,
      "08_second_critique.txt"
    );
    fs.writeFileSync(critiquePath, critique);
    this.outputFiles["Second Critique"] = critiquePath;

    // Save the further improved translation
    const furtherImprovedPath = path.join(
      this.config.outputDir,
      "09_further_improved_translation.txt"
    );
    fs.writeFileSync(furtherImprovedPath, furtherImprovedTranslation);
    this.outputFiles["Further Improved Translation"] = furtherImprovedPath;

    this.log(
      chalk.green(
        "  ↪ Second critique and further improved translation saved to disk"
      )
    );
  }

  // Step 8: Final translation with comprehensive review
  private async finalTranslation(): Promise<string> {
    this.translationSteps.push("Final Translation");
    this.spinner.start(
      chalk.blue("🏁 Creating final translation with comprehensive review")
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
also reading naturally and beautifully in ${this.config.targetLanguage}.

Please put your review in <review> tags and your final translation in <final_translation> tags.`;

    const response = await this.callOpenAI(prompt);
    this.spinner.succeed(chalk.green("🏁 Final translation completed"));

    // Extract comprehensive review
    const reviewMatch = response.match(/<review>([\s\S]*)<\/review>/);
    const review = reviewMatch ? reviewMatch[1].trim() : "";

    // Extract final translation
    const finalTranslationMatch = response.match(
      /<final_translation>([\s\S]*)<\/final_translation>/
    );
    const finalTranslation = finalTranslationMatch
      ? finalTranslationMatch[1].trim()
      : response;

    // Save the comprehensive review
    const reviewPath = path.join(
      this.config.outputDir,
      "10_comprehensive_review.txt"
    );
    fs.writeFileSync(reviewPath, review);
    this.outputFiles["Comprehensive Review"] = reviewPath;

    this.log(
      chalk.green(
        "  ↪ Comprehensive review and final translation saved to disk"
      )
    );

    // Return the final translation
    return finalTranslation;
  }

  // Helper method to call OpenAI API
  private async callOpenAI(prompt: string, retryCount = 0): Promise<string> {
    try {
      // Add the prompt to the conversation
      this.conversation.push({
        role: "user",
        content: prompt,
      });

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: this.config.modelName,
        messages: this.conversation,
        temperature: 0.7,
      });

      // Update token count
      this.totalTokens += completion.usage?.total_tokens || 0;

      // Add the response to the conversation
      const responseContent = completion.choices[0].message.content || "";
      this.conversation.push({
        role: "assistant",
        content: responseContent,
      });

      return responseContent;
    } catch (error: any) {
      this.spinner.fail(
        `API call failed (attempt ${retryCount + 1}/${
          this.config.maxRetries + 1
        })`
      );

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
        return this.callOpenAI(prompt, retryCount + 1);
      }

      console.error(
        chalk.red("❌ Error calling OpenAI API:"),
        error?.message || error
      );
      throw error;
    }
  }

  // Helper method to save the final translation
  private saveTranslation(translation: string): void {
    const outputPath = path.join(
      this.config.outputDir,
      "final_translation.txt"
    );
    fs.writeFileSync(outputPath, translation);
    this.outputFiles["Final Translation"] = outputPath;

    this.log(chalk.green(`📝 Final translation saved to ${outputPath}`));
  }

  // Helper method to save the conversation history
  private saveConversationHistory(): void {
    const historyPath = path.join(
      this.config.outputDir,
      "conversation_history.json"
    );
    fs.writeFileSync(historyPath, JSON.stringify(this.conversation, null, 2));
    this.outputFiles["Conversation History"] = historyPath;

    // Also save in a more human-readable format
    const readableHistoryPath = path.join(
      this.config.outputDir,
      "conversation_history.txt"
    );
    let readableHistory = "";

    this.conversation.forEach((message, index) => {
      if (index > 0) readableHistory += "\n\n" + "-".repeat(80) + "\n\n";
      readableHistory += `${message.role.toUpperCase()}:\n\n${message.content}`;
    });

    fs.writeFileSync(readableHistoryPath, readableHistory);
    this.outputFiles["Readable Conversation History"] = readableHistoryPath;

    this.log(
      chalk.green(
        `💬 Conversation history saved to ${historyPath} and ${readableHistoryPath}`
      )
    );
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
    "Directory to save translation and analysis files"
  )
  .requiredOption("-s, --source <language>", "Source language")
  .requiredOption("-t, --target <language>", "Target language")
  .option("-m, --model <name>", "OpenAI model name", "gpt-4o")
  .option("-v, --verbose", "Verbose output", true)
  .option("-r, --retries <number>", "Maximum number of API call retries", "3")
  .option("-d, --delay <ms>", "Delay between retries in milliseconds", "5000")
  .action(async (options) => {
    try {
      // Validate input file exists
      if (!fs.existsSync(options.input)) {
        console.error(chalk.red(`❌ Input file not found: ${options.input}`));
        process.exit(1);
      }

      // Read input file
      const sourceText = fs.readFileSync(options.input, "utf-8");

      // Create output directory if it doesn't exist
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

      console.log(chalk.cyan("🚀 Starting AI-powered translation workflow"));
      console.log(chalk.cyan(`📂 Output will be saved to: ${options.output}`));

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
      };

      // Create and execute workflow
      const workflow = new TranslationWorkflow(config);
      await workflow.execute();
    } catch (error) {
      console.error(chalk.red("❌ Translation failed:"), error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
