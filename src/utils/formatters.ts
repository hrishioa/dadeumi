/**
 * Formatting utilities for time, progress bars, and other display elements
 */

/**
 * Format time in minutes and seconds
 */
export function formatTime(timeInMinutes: number): string {
  if (timeInMinutes < 1) {
    return `${Math.round(timeInMinutes * 60)} seconds`;
  } else {
    const minutes = Math.floor(timeInMinutes);
    const seconds = Math.round((timeInMinutes - minutes) * 60);
    return `${minutes} min ${seconds} sec`;
  }
}

/**
 * Format duration in hours, minutes, and seconds
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes} min ${remainingSeconds} sec`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${hours} hr ${minutes} min ${remainingSeconds} sec`;
  }
}

/**
 * Create a visual progress bar
 */
export function createProgressBar(
  ratio: number,
  validSource: boolean = true
): string {
  if (!validSource) {
    return "N/A (source metrics unavailable)";
  }

  const width = 20;
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  let bar = "";

  if (ratio > 1) {
    // More than 100%
    bar = "▓".repeat(width) + " +" + Math.round((ratio - 1) * 100) + "%";
  } else if (ratio >= 0) {
    // Less than or equal to 100%
    bar = "▓".repeat(filled) + "░".repeat(empty);
  } else {
    bar = "Invalid ratio";
  }

  return bar;
}

/**
 * Calculate percentage change between two numbers
 */
export function calculateChange(from: number, to: number): string {
  const change = ((to - from) / from) * 100;
  if (change > 0) {
    return `+${change.toFixed(1)}%`;
  } else if (change < 0) {
    return `${change.toFixed(1)}%`;
  } else {
    return "0%";
  }
}
