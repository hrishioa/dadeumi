# Daedumi

AI-powered literary translation workflow, inspired by the Korean method of iterative textile refinement.

## About

Daedumi is a sophisticated tool for literary translation that leverages AI to create high-quality translations that preserve the original text's tone, style, and cultural nuances. The name "Daedumi" comes from the Korean method of beating cloth to refine it, reflecting the iterative nature of our translation process.

## Features

- Multi-stage translation workflow for thorough, high-quality results
- Supports translation between any language pair
- Detailed analysis of source text to preserve tone, style, and cultural elements
- Multiple rounds of refinement with self-critique
- External review option for additional perspective
- Detailed metrics and comparison between source and translated text
- Support for OpenAI and Anthropic Claude models
- Cost tracking and estimation

## Installation

```bash
# Install with npm
npm install -g daedumi

# Or install with yarn
yarn global add daedumi

# Or use with npx
npx daedumi
```

## Usage

```bash
# Basic usage
daedumi -i input.txt -o output_dir -t Spanish

# Specify source language (optional)
daedumi -i input.txt -o output_dir -s English -t Japanese

# Use a specific model
daedumi -i input.txt -o output_dir -t French -m gpt-4o

# Skip external review
daedumi -i input.txt -o output_dir -t German --skip-external-review

# Add custom instructions
daedumi -i input.txt -o output_dir -t Italian --instructions "Maintain a formal tone"

# Or use instructions from a file
daedumi -i input.txt -o output_dir -t Russian --instructions-file custom_instructions.txt
```

## Requirements

- Node.js 18+
- OpenAI API key (set as OPENAI_API_KEY environment variable)
- Anthropic API key (optional, set as ANTHROPIC_API_KEY environment variable) for external review

## License

MIT
