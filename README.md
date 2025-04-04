# Daedumi

<div align="center">
  <h3>AI-powered literary translation workflow</h3>
  <p>Inspired by the Korean method of iterative textile refinement</p>

  <p>
    <a href="#installation">Installation</a> •
    <a href="#usage">Usage</a> •
    <a href="#features">Features</a> •
    <a href="#the-daedumi-workflow">Workflow</a> •
    <a href="#api">API</a> •
    <a href="#faq">FAQ</a>
  </p>
</div>

---

## What is Daedumi?

Daedumi is a sophisticated AI-powered translation tool designed specifically for literary and creative translations. The name "Daedumi" is inspired by the traditional Korean textile refinement process, which involves multiple passes of increasingly fine work to create an exceptional final product.

Unlike conventional translation tools that focus on literal, one-pass translations, Daedumi follows a multi-stage workflow that includes analysis, cultural adaptation, and iterative refinement to produce translations that capture not just the words, but the essence, tone, and cultural nuances of the original text.

## Features

- **Multi-stage Translation Workflow** - Employs a 10-step iterative refinement process similar to the traditional Korean textile method
- **Cultural Adaptation** - Carefully adapts cultural references and idioms for the target language
- **Self-critique and Refinement** - Built-in reflection and improvement cycles
- **External Review Option** - Optional second-opinion from a different AI model
- **CLI and Library Support** - Use as a command-line tool or integrate into your applications
- **Multi-model Support** - Works with both OpenAI (GPT-4o, GPT-4, etc.) and Anthropic (Claude) models
- **Detailed Metrics** - Provides comprehensive statistics on the translation process
- **Resumable Sessions** - Can resume interrupted translation workflows
- **Detailed Documentation** - Generated at each step to explain the translation choices

## Installation

Install Daedumi globally to use the CLI tool:

```bash
npm install -g daedumi
```

Or locally to use as a library:

```bash
npm install daedumi
```

## Usage

### CLI

```bash
# Basic usage
daedumi translate -i input.txt -t Japanese -o output-directory

# With source language specified
daedumi translate -i input.txt -s English -t Spanish -o output-directory

# Use a specific model
daedumi translate -i input.txt -t German -m gpt-4o-mini -o output-directory

# Use Claude 3.7 Sonnet for translation (requires ANTHROPIC_API_KEY)
daedumi translate -i input.txt -t Korean -m claude-3-7-sonnet-latest -o output-directory

# Skip external review
daedumi translate -i input.txt -t French --skip-external-review -o output-directory

# Add custom translation instructions
daedumi translate -i input.txt -t Korean --instructions "Translate with a formal tone suitable for academic audiences" -o output-directory

# View pricing information
daedumi pricing
```

See the [examples directory](./examples/cli-example.md) for more CLI usage examples.

### Programmatic Usage

```javascript
// ESM
import { translate } from "daedumi";

// CommonJS
const { translate } = require("daedumi");

async function runTranslation() {
  const translatedText = await translate("Your source text here", "Spanish", {
    sourceLanguage: "English", // Optional, will be auto-detected
    modelName: "gpt-4o", // Default model
    verbose: true, // Display detailed logs
    outputDir: "./translations", // Where to save intermediates
  });

  console.log(translatedText);
}
```

For more detailed examples, see the [JavaScript example](./examples/programmatic-example.js) and [TypeScript example](./examples/programmatic-example.ts) in the examples directory.

## The Daedumi Workflow

Daedumi's translation process is modeled after the Korean "Daedumi" textile refinement method, which involves multiple steps of increasing refinement:

1. **Initial Analysis** - Analyzes the source text for tone, style, and cultural elements
2. **Expression Exploration** - Explores how to express key concepts in the target language
3. **Cultural Adaptation** - Discusses how to adapt cultural references appropriately
4. **Title & Inspiration** - Considers title translation options and literary inspirations
5. **First Translation** - Creates an initial translation draft
6. **Self-critique & Refinement** - Critically reviews and improves the translation
7. **Second Refinement** - Further polishes the translation with fresh perspective
8. **Final Translation** - Creates a comprehensive review and final translation
9. **External Review** (optional) - Gets feedback from a different AI model
10. **Final Refinement** - Applies the external feedback for the polished result

## API

### `translate`

```typescript
async function translate(
  text: string,
  targetLanguage: string,
  options?: {
    sourceLanguage?: string;
    modelName?: string;
    outputDir?: string;
    verbose?: boolean;
    skipExternalReview?: boolean;
    customInstructions?: string;
  }
): Promise<string>;
```

### `TranslationWorkflow`

For more advanced usage, you can use the `TranslationWorkflow` class directly:

```typescript
import { TranslationWorkflow, TranslationConfig } from "daedumi";

const config: TranslationConfig = {
  sourceText: "Your text here",
  targetLanguage: "Japanese",
  // ... other options
};

const workflow = new TranslationWorkflow(config);
await workflow.execute();
```

## Environment Variables

Daedumi requires API keys to work:

- `OPENAI_API_KEY` - Required for using OpenAI models (default)
- `ANTHROPIC_API_KEY` - Optional, for external review with Claude models

You can set these in a `.env` file in your project root.

## FAQ

**Q: What makes Daedumi different from other translation tools?**

A: Daedumi employs a multi-stage, iterative refinement process inspired by traditional Korean textile techniques. Unlike other tools that produce single-pass translations, Daedumi analyzes, explores, and refines translations through multiple stages for higher quality results.

**Q: What kinds of texts work best with Daedumi?**

A: Daedumi excels with creative, literary, and nuanced texts where preserving tone, style, and cultural elements is important. It's ideal for literature, marketing copy, poetry, and culturally-rich content.

**Q: Which models work best?**

A: For high-quality translations, we recommend using GPT-4o or Claude 3 Opus. For faster or more economical translations, GPT-4o-mini or Claude 3 Sonnet work well.

**Q: Can I customize the translation style?**

A: Yes, use the `--instructions` parameter or `customInstructions` option to specify tone, audience, formality level, or other stylistic preferences.

## License

[MIT](LICENSE)

## Acknowledgments

- Inspired by the traditional Korean textile refinement process
- Built with OpenAI and Anthropic AI models
- Uses a modular architecture for extensibility
