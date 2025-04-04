import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import * as dotenv from "dotenv";
import chalk from "chalk";
import { TranslationWorkflow } from "./core/TranslationWorkflow";
import { TranslationConfig } from "./types";

// Load environment variables
dotenv.config();

// Create command line interface
const program = new Command();

program
  .name("daedumi")
  .description("Daedumi - AI-powered literary translation workflow")
  .version("0.1.0")
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
  .option("-m, --model <name>", "AI model name", "gpt-4o")
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
  );

// Add a command to display pricing information
program
  .command("pricing")
  .description("Display pricing information for supported models")
  .action(() => {
    console.log(chalk.cyan.bold("\n📊 Daedumi Supported Models and Pricing\n"));

    console.log(chalk.cyan("OpenAI Models:"));
    console.log(
      chalk.cyan("─────────────────────────────────────────────────")
    );
    console.log(
      chalk.cyan("Model               │ Input (per 1M) │ Output (per 1M)")
    );
    console.log(
      chalk.cyan("───────────────────┼────────────────┼─────────────────")
    );
    console.log(chalk.cyan("gpt-4o             │ $2.50          │ $10.00"));
    console.log(chalk.cyan("gpt-4o-mini        │ $0.15          │ $0.60"));
    console.log(chalk.cyan("o1                 │ $15.00         │ $60.00"));
    console.log(chalk.cyan("o3-mini            │ $1.10          │ $4.40"));
    console.log(chalk.cyan("gpt-4.5-preview    │ $75.00         │ $150.00"));

    console.log(chalk.cyan("\nAnthropic Models:"));
    console.log(
      chalk.cyan("─────────────────────────────────────────────────")
    );
    console.log(
      chalk.cyan("Model               │ Input (per 1M) │ Output (per 1M)")
    );
    console.log(
      chalk.cyan("───────────────────┼────────────────┼─────────────────")
    );
    console.log(chalk.cyan("claude-3-7-sonnet  │ $3.00          │ $15.00"));

    console.log(chalk.cyan("\nToken Limits:"));
    console.log(
      chalk.cyan("─────────────────────────────────────────────────")
    );
    console.log(chalk.cyan("Model               │ Output Token Limit"));
    console.log(chalk.cyan("───────────────────┼─────────────────────"));
    console.log(chalk.cyan("gpt-4o             │ 16,384"));
    console.log(chalk.cyan("gpt-4o-mini        │ 16,384"));
    console.log(chalk.cyan("gpt-4.5-preview    │ 16,384"));
    console.log(chalk.cyan("claude-3-7-sonnet  │ 128,000"));
    console.log(chalk.cyan("o1, o3-mini        │ No specific limit\n"));

    console.log(
      chalk.yellow(
        "Note: Pricing is subject to change. Verify current pricing at:"
      )
    );
    console.log(chalk.yellow("- OpenAI: https://openai.com/pricing"));
    console.log(chalk.yellow("- Anthropic: https://anthropic.com/pricing\n"));

    console.log(chalk.green("Examples:"));
    console.log(
      chalk.green("  daedumi -i input.txt -o output -t Spanish -m gpt-4o")
    );
    console.log(
      chalk.green(
        "  daedumi -i input.txt -o output -t Japanese -m claude-3-7-sonnet-latest\n"
      )
    );
  });

// Function to show available models as a hint
function printModelSuggestions() {
  console.log(chalk.cyan("\n💡 Available models:"));
  console.log(chalk.cyan("  OpenAI:"));
  console.log(chalk.cyan("    - gpt-4o (Default, balanced)"));
  console.log(chalk.cyan("    - gpt-4o-mini (Faster, lower cost)"));
  console.log(chalk.cyan("    - o1 (Highest quality, highest cost)"));
  console.log(chalk.cyan("    - o3-mini (Good quality/cost balance)"));

  console.log(chalk.cyan("\n  Anthropic (requires ANTHROPIC_API_KEY):"));
  console.log(
    chalk.cyan("    - claude-3-7-sonnet-latest (Best quality/cost ratio)")
  );

  console.log(
    chalk.yellow(
      "\n  Example: daedumi -i input.txt -o output -t Spanish -m claude-3-7-sonnet-latest"
    )
  );
  console.log(
    chalk.yellow("  Run 'daedumi pricing' for detailed pricing information\n")
  );
}

program.action(async (options) => {
  let workflow: TranslationWorkflow | null = null;

  try {
    // --- Model Selection Logic ---
    // If Anthropic API key is available and no model explicitly specified,
    // suggest Claude 3.7 as the default option
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const userSpecifiedModel = program.getOptionValueSource("model") === "user";

    if (hasAnthropicKey && !userSpecifiedModel) {
      console.log(
        chalk.green(
          "💡 ANTHROPIC_API_KEY detected - you can use Claude models as well"
        )
      );
      console.log(
        chalk.green("   For best results try: -m claude-3-7-sonnet-latest")
      );
    }

    // --- Model-Specific Adjustments ---
    let maxOutputTokens = parseInt(options.maxOutputTokens);

    // Define model-specific limits
    const modelLimits: Record<string, number> = {
      "gpt-4.5-preview": 16384,
      "gpt-4o": 16384,
      "gpt-4o-mini": 16384,
      "claude-3-7-sonnet-latest": 128000,
    };

    // Check for limits by exact match or prefix
    let modelLimit: number | undefined;

    // Try exact match first
    modelLimit = modelLimits[options.model];

    // If no exact match, try prefix matching
    if (!modelLimit) {
      for (const [modelPrefix, limit] of Object.entries(modelLimits)) {
        if (options.model.startsWith(modelPrefix)) {
          modelLimit = limit;
          break;
        }
      }
    }

    // Apply limit if found
    if (modelLimit) {
      const optionSource = program.getOptionValueSource("maxOutputTokens");

      if (optionSource !== "user") {
        // Default value is being used, check if it exceeds the model limit
        if (maxOutputTokens > modelLimit) {
          console.log(
            chalk.yellow(
              `⚠️ Model ${options.model} has a limit of ${modelLimit} output tokens. Automatically adjusting --max-output-tokens from default ${maxOutputTokens} to ${modelLimit}.`
            )
          );
          maxOutputTokens = modelLimit;
        }
      } else {
        // User explicitly set the value, warn if it exceeds the limit
        if (maxOutputTokens > modelLimit) {
          console.warn(
            chalk.red(
              `❌ Explicit --max-output-tokens (${maxOutputTokens}) exceeds the limit (${modelLimit}) for model ${options.model}. This will likely cause an API error.`
            )
          );
        }
      }
    }

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
        chalk.yellow(
          "💡 Set it in a .env file or export it in your shell. For example:"
        )
      );
      console.log(chalk.cyan("  echo 'OPENAI_API_KEY=your-key-here' > .env"));
      console.log(
        chalk.yellow(
          "📘 You can get an API key from: https://platform.openai.com/api-keys"
        )
      );
      process.exit(1);
    }

    // Check for Anthropic API key
    if (process.env.ANTHROPIC_API_KEY) {
      console.log(
        chalk.green(
          "✅ ANTHROPIC_API_KEY found - will use Claude for external review"
        )
      );
    } else {
      console.log(
        chalk.yellow(
          "ℹ️ ANTHROPIC_API_KEY not found - will use OpenAI for external review"
        )
      );
      console.log(
        chalk.gray(
          "  💡 To use Claude for external review, get an API key from: https://console.anthropic.com/"
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

    // Log startup information
    console.log(chalk.cyan("🚀 Starting Daedumi translation workflow"));
    console.log(chalk.cyan(`📂 Output directory: ${options.output}`));

    // Create translation configuration
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
      reasoningEffort: options.reasoningEffort as "low" | "medium" | "high",
      maxOutputTokens: maxOutputTokens,
      originalFilename,
      originalExtension,
      inputPath,
    };

    // Create and execute workflow
    workflow = new TranslationWorkflow(config);
    await workflow.execute();
  } catch (error) {
    console.error(chalk.red("\n❌ Translation workflow failed:"), error);

    // Show model suggestions if the error is about an unsupported model
    const errorMsg = error?.toString() || "";
    if (errorMsg.includes("Unsupported") && errorMsg.includes("model")) {
      printModelSuggestions();
    }

    // Attempt to save the latest available translation if we have a workflow
    if (workflow) {
      workflow.saveLatestTranslationOnError();
    }

    process.exit(1);
  }
});

// Parse command line arguments
program.parse();
