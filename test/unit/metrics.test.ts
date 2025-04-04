import { describe, test, expect } from "bun:test";
import {
  calculateMetrics,
  calculateMetricsForLanguage,
} from "../../src/utils/metrics";
import { TranslationMetrics } from "../../src/types";

describe("Metrics", () => {
  describe("calculateMetrics", () => {
    test("should calculate metrics for a simple text", () => {
      const text = "This is a simple test text with 9 words.";
      const result = calculateMetrics(text);

      expect(result.targetWordCount).toBe(9);
      expect(result.targetCharCount).toBe(32); // Counting non-whitespace characters
      expect(result.estimatedReadingTime).toBeCloseTo(9 / 200, 5); // 9 words at 200 wpm
    });

    test("should handle empty text", () => {
      const text = "";
      const result = calculateMetrics(text);

      expect(result.targetWordCount).toBe(0);
      expect(result.targetCharCount).toBe(0);
      expect(result.estimatedReadingTime).toBe(0);
    });

    test("should set source metrics correctly when isSourceText is true", () => {
      const text = "Source text with 5 words";
      const result = calculateMetrics(text, true);

      expect(result.sourceWordCount).toBe(5);
      expect(result.targetWordCount).toBe(5);
      expect(result.sourceCharCount).toBe(20);
      expect(result.targetCharCount).toBe(20);
      expect(result.ratio).toBe(1); // Ratio should be 1 for source text
    });

    test("should use provided source metrics when available", () => {
      const text = "Target text with 5 words";
      const sourceMetrics: TranslationMetrics = {
        sourceWordCount: 10,
        targetWordCount: 0,
        sourceCharCount: 38,
        targetCharCount: 0,
        ratio: 0,
        estimatedReadingTime: 0.05,
      };

      const result = calculateMetrics(text, false, sourceMetrics);

      expect(result.sourceWordCount).toBe(10);
      expect(result.targetWordCount).toBe(5);
      expect(result.sourceCharCount).toBe(38);
      expect(result.targetCharCount).toBe(20);
      expect(result.ratio).toBe(0.5); // 5/10 = 0.5
    });
  });

  describe("calculateMetricsForLanguage", () => {
    test("should use regular word counting for space-separated languages", () => {
      const text = "This is English text with 6 words.";
      const result = calculateMetricsForLanguage(text, "english");

      expect(result.targetWordCount).toBe(7);
      expect(result.targetCharCount).toBe(28);
    });

    test("should use character-based estimation for Chinese", () => {
      const text = "这是中文"; // "This is Chinese" in Chinese
      const result = calculateMetricsForLanguage(text, "chinese");

      // For character-based languages, words are estimated as characters/2
      expect(result.targetWordCount).toBe(Math.round(text.length / 2));
      expect(result.targetCharCount).toBe(4);
    });

    test("should use character-based estimation for Japanese", () => {
      const text = "これは日本語です"; // "This is Japanese" in Japanese
      const result = calculateMetricsForLanguage(text, "japanese");

      expect(result.targetWordCount).toBe(Math.round(text.length / 2));
      expect(result.targetCharCount).toBe(8);
    });

    test("should use character-based estimation for Korean", () => {
      const text = "이것은 한국어입니다"; // "This is Korean" in Korean
      const result = calculateMetricsForLanguage(text, "korean");

      // Note: Korean actually uses spaces between words, but our implementation
      // treats it as character-based for this test
      expect(result.targetWordCount).toBe(
        Math.round(text.replace(/\s/g, "").length / 2)
      );
      expect(result.targetCharCount).toBe(9);
    });
  });
});
