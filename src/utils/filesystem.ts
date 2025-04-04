import * as fs from "fs";
import * as path from "path";

/**
 * Utilities for file system operations
 */

/**
 * Ensure a directory exists, create it if it doesn't
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Save data to a JSON file
 */
export function saveJson(filePath: string, data: any): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving JSON to ${filePath}:`, error);
    throw error;
  }
}

/**
 * Load data from a JSON file
 */
export function loadJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as T;
    }
    return defaultValue;
  } catch (error) {
    console.error(`Error loading JSON from ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * Save text to a file
 */
export function saveText(filePath: string, text: string): void {
  try {
    ensureDirectoryExists(path.dirname(filePath));
    fs.writeFileSync(filePath, text);
  } catch (error) {
    console.error(`Error saving text to ${filePath}:`, error);
    throw error;
  }
}

/**
 * Load text from a file
 */
export function loadText(filePath: string, defaultValue: string = ""): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
    return defaultValue;
  } catch (error) {
    console.error(`Error loading text from ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * Find the latest file from a list of filenames in a directory
 */
export function findLatestFile(
  directory: string,
  fileNames: string[]
): string | null {
  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Get all files in a directory matching a pattern
 */
export function findFilesInDirectory(
  directory: string,
  pattern: RegExp
): string[] {
  try {
    if (!fs.existsSync(directory)) {
      return [];
    }

    const files = fs.readdirSync(directory);
    return files
      .filter((file) => pattern.test(file))
      .map((file) => path.join(directory, file));
  } catch (error) {
    console.error(`Error finding files in ${directory}:`, error);
    return [];
  }
}
