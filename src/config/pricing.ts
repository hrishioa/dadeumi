import { ModelPricing } from "../types";

/**
 * Pricing data for various AI models (cost per million tokens)
 * Note: Prices may change, verify with official documentation
 */
export const pricingData: Map<string, ModelPricing> = new Map([
  // OpenAI Models
  ["gpt-4o", { inputCostPerMillion: 2.5, outputCostPerMillion: 10.0 }],
  ["gpt-4o-mini", { inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 }],
  ["o1", { inputCostPerMillion: 15.0, outputCostPerMillion: 60.0 }],
  ["o3-mini", { inputCostPerMillion: 1.1, outputCostPerMillion: 4.4 }],
  // Specific versions
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

  // Anthropic Models
  [
    "claude-3-opus-20240229",
    { inputCostPerMillion: 15.0, outputCostPerMillion: 75.0 },
  ],
  [
    "claude-3-sonnet-20240229",
    { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
  ],
  [
    "claude-3-haiku-20240307",
    { inputCostPerMillion: 0.25, outputCostPerMillion: 1.25 },
  ],
  [
    "claude-3-5-sonnet-20240620",
    { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
  ],
  [
    "claude-3-7-sonnet-latest",
    { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
  ],
]);
