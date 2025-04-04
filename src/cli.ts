import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import * as dotenv from "dotenv";
import chalk from "chalk";
import { TranslationWorkflow } from "./core/TranslationWorkflow";
import { TranslationConfig } from "./types";

// Load environment variables
dotenv.config();

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

  console.log(chalk.yellow("\n  Examples:"));
  console.log(
    chalk.yellow("  dadeumi -i input.txt -o output -t Spanish -m gpt-4o")
  );
  console.log(
    chalk.yellow(
      "  dadeumi -i input.txt -o output -t Japanese -m claude-3-7-sonnet-latest"
    )
  );

  console.log(
    chalk.magenta(
      "\n  Note: To use Claude models you must set ANTHROPIC_API_KEY in your .env file"
    )
  );
}

// Function to display pricing information
function displayPricingInfo() {
  console.log(chalk.cyan.bold("\n📊 Dadeumi Supported Models and Pricing\n"));

  console.log(chalk.cyan("OpenAI Models:"));
  console.log(chalk.cyan("─────────────────────────────────────────────────"));
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
  console.log(chalk.cyan("─────────────────────────────────────────────────"));
  console.log(
    chalk.cyan("Model               │ Input (per 1M) │ Output (per 1M)")
  );
  console.log(
    chalk.cyan("───────────────────┼────────────────┼─────────────────")
  );
  console.log(chalk.cyan("claude-3-7-sonnet  │ $3.00          │ $15.00"));

  console.log(chalk.cyan("\nToken Limits:"));
  console.log(chalk.cyan("─────────────────────────────────────────────────"));
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
}

// Create a program
const program = new Command();

// Configure the program
program
  .name("dadeumi")
  .description("Dadeumi - AI-powered literary translation workflow")
  .version("0.1.0")
  .option("-i, --input <path>", "Path to the input file")
  .option("-o, --output <directory>", "Directory to save final translation")
  .option(
    "-s, --source <language>",
    "Source language (optional, will be auto-detected if omitted)"
  )
  .option("-t, --target <language>", "Target language")
  .option("-m, --model <n>", "AI model name", "gpt-4o")
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
  .addHelpText(
    "beforeAll",
    `
📚 Dadeumi - AI-powered literary translation workflow

Dadeumi creates high-quality literary translations using AI, employing a
multi-step workflow inspired by the Korean textile refinement process.
`
  )
  .addHelpText("afterAll", () => {
    printModelSuggestions();
    displayPricingInfo();
    return "";
  });

// Add an action handler
program.action(async (options) => {
  // Check if required options are provided
  if (!options.input || !options.output || !options.target) {
    console.log(
      chalk.cyan.bold(
        "\n📚 Dadeumi - AI-powered literary translation workflow\n"
      )
    );
    console.log(chalk.red("❌ Missing required options. Please provide:"));
    if (!options.input) console.log(chalk.red("  - Input file (-i, --input)"));
    if (!options.output)
      console.log(chalk.red("  - Output directory (-o, --output)"));
    if (!options.target)
      console.log(chalk.red("  - Target language (-t, --target)"));

    console.log(chalk.yellow("\nUsage:"));
    console.log(
      chalk.yellow(
        "  dadeumi -i input.txt -o output-dir -t TARGET_LANGUAGE [options]\n"
      )
    );
    console.log(chalk.yellow("Examples:"));
    console.log(
      chalk.yellow("  dadeumi -i story.txt -o translations -t Spanish")
    );
    console.log(
      chalk.yellow(
        "  dadeumi -i poem.txt -o translations -t Japanese -m gpt-4o-mini"
      )
    );

    printModelSuggestions();
    displayPricingInfo();
    process.exit(1);
  }

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

    // Define model-specific OUTPUT token limits (max tokens per response)
    // Note: These are different from context limits (which are larger)
    const outputTokenLimits: Record<string, number> = {
      // OpenAI models - 16K output limit, 128K context
      "gpt-4.5-preview": 16384,
      "gpt-4o": 16384,
      "gpt-4o-mini": 16384,
      "gpt-4": 8192,

      // Claude models - larger output limits
      "claude-3-7-sonnet-latest": 128000,
      "claude-3-opus-20240229": 128000,
      "claude-3-sonnet-20240229": 128000,
      "claude-3-haiku-20240307": 32768,
      "claude-3-5-sonnet-20240620": 128000,
    };

    // Check for limits by exact match or prefix
    let modelLimit: number | undefined;

    // Try exact match first
    modelLimit = outputTokenLimits[options.model];

    // If no exact match, try prefix matching
    if (!modelLimit) {
      for (const [modelPrefix, limit] of Object.entries(outputTokenLimits)) {
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
    console.log(chalk.cyan("🚀 Starting Dadeumi translation workflow"));
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

// Show help if no arguments provided
if (process.argv.length <= 2) {
  console.log(
    chalk.cyan.bold("\n📚 Dadeumi - AI-powered literary translation workflow\n")
  );
  console.log(
    chalk.cyan(
      "Dadeumi creates high-quality literary translations using AI, employing a"
    )
  );
  console.log(
    chalk.cyan(
      "multi-step workflow inspired by the Korean textile refinement process."
    )
  );

  console.log(chalk.yellow("\nUsage:"));
  console.log(
    chalk.yellow(
      "  dadeumi -i input.txt -o output-dir -t TARGET_LANGUAGE [options]\n"
    )
  );

  console.log(chalk.yellow("Examples:"));
  console.log(
    chalk.yellow("  dadeumi -i story.txt -o translations -t Spanish")
  );
  console.log(
    chalk.yellow(
      "  dadeumi -i poem.txt -o translations -t Japanese -m gpt-4o-mini"
    )
  );
  console.log(
    chalk.yellow(
      "  dadeumi -i article.md -o translations -t French -m claude-3-7-sonnet-latest\n"
    )
  );

  printModelSuggestions();
  displayPricingInfo();

  console.log(chalk.yellow("\nFor more options:"));
  console.log(chalk.yellow("  dadeumi --help\n"));
  process.exit(0);
}

// Parse command line arguments
program.parse();
