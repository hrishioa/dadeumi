# Dadeumi CLI Examples

This document shows various ways to use the Dadeumi command-line interface for different translation scenarios.

## Basic Usage

Translate a text file from auto-detected language to Spanish:

```bash
dadeumi -i input.txt -t Spanish -o output-directory
```

## Specifying Source Language

When you know the source language, specifying it can improve results:

```bash
dadeumi -i input.txt -s English -t Japanese -o output-directory
```

## Using Different Models

Choose different AI models based on your quality needs or budget:

```bash
# Use the most capable OpenAI model
dadeumi -i input.txt -t French -m gpt-4o -o output-directory

# Use a faster, more economical model
dadeumi -i input.txt -t German -m gpt-4o-mini -o output-directory

# Use Claude model (requires ANTHROPIC_API_KEY)
dadeumi -i input.txt -t Korean -m claude-3-7-sonnet-latest -o output-directory
```

## Customizing Translation Style

Add specific instructions to control the translation style:

```bash
# Formal academic style
dadeumi -i input.txt -t Spanish --instructions "Translate with a formal tone suitable for academic papers" -o output-directory

# Marketing copy style
dadeumi -i input.txt -t French --instructions "Translate with an engaging, persuasive tone for marketing copy" -o output-directory

# Using an instructions file
echo "Translate in the style of Ernest Hemingway - direct, simple sentences with powerful imagery" > instructions.txt
dadeumi -i input.txt -t English --instructions-file instructions.txt -o output-directory
```

## Advanced Options

Fine-tune the translation process:

```bash
# Skip external review step to save time
dadeumi -i input.txt -t Italian --skip-external-review -o output-directory

# Increase retries for unstable connections
dadeumi -i input.txt -t Chinese -r 5 -d 10000 -o output-directory

# Adjust model output tokens for very long texts
dadeumi -i input.txt -t Russian --max-output-tokens 40000 -o output-directory

# Control reasoning effort for o1/o3 models
dadeumi -i input.txt -t Arabic -m o1-preview --reasoning-effort high -o output-directory
```

## Environment Setup

Before running Dadeumi, set up your API keys:

```bash
# Create a .env file
echo "OPENAI_API_KEY=your-key-here" > .env
echo "ANTHROPIC_API_KEY=your-anthropic-key-here" >> .env

# Or export directly in your shell
export OPENAI_API_KEY=your-key-here
export ANTHROPIC_API_KEY=your-anthropic-key-here
```

Get API keys from:

- OpenAI: https://platform.openai.com/api-keys (required)
- Anthropic: https://console.anthropic.com/ (optional, for Claude models)
