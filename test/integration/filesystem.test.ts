import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  saveText,
  loadText,
  saveJson,
  loadJson,
  ensureDirectoryExists,
  findLatestFile,
} from "../../src/utils/filesystem";

describe("FileSystem Operations", () => {
  const testDir = path.join(process.cwd(), "test", "temp");

  // Set up and clean up test directory
  beforeEach(() => {
    ensureDirectoryExists(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      // Clean up test files
      const files = fs.readdirSync(testDir);
      files.forEach((file) => {
        try {
          fs.unlinkSync(path.join(testDir, file));
        } catch (err) {
          // Ignore permission errors when cleaning up
          console.log(
            `Note: Could not delete test file ${file} - permission error`
          );
        }
      });

      // Remove directory
      try {
        fs.rmdirSync(testDir);
      } catch (err) {
        // Ignore permission errors when removing directory
        console.log(
          `Note: Could not remove test directory ${testDir} - permission error`
        );
      }
    }
  });

  test("should save and load text files", () => {
    const testFilePath = path.join(testDir, "test.txt");
    const content = "This is test content";

    saveText(testFilePath, content);
    expect(fs.existsSync(testFilePath)).toBe(true);

    const loadedContent = loadText(testFilePath);
    expect(loadedContent).toBe(content);
  });

  test("should return default value when loading non-existent text file", () => {
    const nonExistentPath = path.join(testDir, "non-existent.txt");
    const defaultValue = "default text";

    const result = loadText(nonExistentPath, defaultValue);
    expect(result).toBe(defaultValue);
  });

  test("should save and load JSON files", () => {
    const testFilePath = path.join(testDir, "test.json");
    const data = { name: "Test", values: [1, 2, 3], nested: { key: "value" } };

    saveJson(testFilePath, data);
    expect(fs.existsSync(testFilePath)).toBe(true);

    const loadedData = loadJson(testFilePath, null);
    expect(loadedData).toEqual(data);
  });

  test("should return default value when loading non-existent JSON file", () => {
    const nonExistentPath = path.join(testDir, "non-existent.json");
    const defaultValue = { default: true };

    const result = loadJson(nonExistentPath, defaultValue);
    expect(result).toEqual(defaultValue);
  });

  test("should find the latest existing file from a list", () => {
    // Create test files
    const file1 = path.join(testDir, "file1.txt");
    const file2 = path.join(testDir, "file2.txt");
    const file3 = path.join(testDir, "file3.txt");

    saveText(file1, "Content 1");
    saveText(file2, "Content 2");
    // Don't create file3

    // First file in list exists
    expect(findLatestFile(testDir, ["file1.txt", "non-existent.txt"])).toBe(
      file1
    );

    // Only second file in list exists
    expect(findLatestFile(testDir, ["non-existent.txt", "file2.txt"])).toBe(
      file2
    );

    // No files exist
    expect(findLatestFile(testDir, ["file3.txt", "not-there.txt"])).toBe(null);

    // File order is respected (first match is returned)
    expect(findLatestFile(testDir, ["file2.txt", "file1.txt"])).toBe(file2);
  });

  test("should create nested directories as needed", () => {
    const nestedDir = path.join(testDir, "level1", "level2", "level3");
    const testFilePath = path.join(nestedDir, "test.txt");

    // Save to a nested path that doesn't exist yet
    saveText(testFilePath, "Content");

    // Check that all directories were created
    expect(fs.existsSync(nestedDir)).toBe(true);
    expect(fs.existsSync(testFilePath)).toBe(true);
  });
});
