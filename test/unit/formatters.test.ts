import { describe, test, expect } from "bun:test";
import {
  formatTime,
  formatDuration,
  createProgressBar,
  calculateChange,
} from "../../src/utils/formatters";

describe("Formatters", () => {
  describe("formatTime", () => {
    test("should format time less than 1 minute", () => {
      expect(formatTime(0.5)).toBe("30 seconds");
      expect(formatTime(0.1)).toBe("6 seconds");
      expect(formatTime(0)).toBe("0 seconds");
    });

    test("should format time in minutes and seconds", () => {
      expect(formatTime(1)).toBe("1 min 0 sec");
      expect(formatTime(1.5)).toBe("1 min 30 sec");
      expect(formatTime(2.25)).toBe("2 min 15 sec");
    });
  });

  describe("formatDuration", () => {
    test("should format duration in seconds", () => {
      expect(formatDuration(30)).toBe("30 seconds");
      expect(formatDuration(45)).toBe("45 seconds");
    });

    test("should format duration in minutes and seconds", () => {
      expect(formatDuration(60)).toBe("1 min 0 sec");
      expect(formatDuration(90)).toBe("1 min 30 sec");
      expect(formatDuration(150)).toBe("2 min 30 sec");
    });

    test("should format duration in hours, minutes, and seconds", () => {
      expect(formatDuration(3600)).toBe("1 hr 0 min 0 sec");
      expect(formatDuration(3690)).toBe("1 hr 1 min 30 sec");
      expect(formatDuration(7320)).toBe("2 hr 2 min 0 sec");
    });
  });

  describe("createProgressBar", () => {
    test("should create a progress bar for ratio less than 1", () => {
      expect(createProgressBar(0)).toBe("░".repeat(20));
      expect(createProgressBar(0.5)).toBe("▓".repeat(10) + "░".repeat(10));
      expect(createProgressBar(0.75)).toBe("▓".repeat(15) + "░".repeat(5));
    });

    test("should create a progress bar for ratio more than 1", () => {
      expect(createProgressBar(1.2)).toContain("▓".repeat(20));
      expect(createProgressBar(1.2)).toContain("+20%");
      expect(createProgressBar(2.5)).toContain("+150%");
    });

    test("should handle invalid source", () => {
      expect(createProgressBar(0.5, false)).toBe(
        "N/A (source metrics unavailable)"
      );
    });
  });

  describe("calculateChange", () => {
    test("should calculate positive percentage change", () => {
      expect(calculateChange(100, 120)).toBe("+20.0%");
      expect(calculateChange(100, 150)).toBe("+50.0%");
    });

    test("should calculate negative percentage change", () => {
      expect(calculateChange(100, 80)).toBe("-20.0%");
      expect(calculateChange(100, 50)).toBe("-50.0%");
    });

    test("should handle no change", () => {
      expect(calculateChange(100, 100)).toBe("0%");
    });
  });
});
