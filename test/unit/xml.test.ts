import { describe, test, expect } from "bun:test";
import { XmlProcessor } from "../../src/utils/xml";

describe("XmlProcessor", () => {
  const processor = new XmlProcessor();

  test("should extract content from XML tags", () => {
    const text = `This is some text with <tag>important content</tag> inside tags.`;
    const result = processor.extractTagContent(text, "tag");
    expect(result).toBe("important content");
  });

  test("should return original text if tag not found", () => {
    const text = `This text doesn't have the requested tag.`;
    const result = processor.extractTagContent(text, "nonexistent");
    expect(result).toBe(text);
  });

  test("should handle multiline content", () => {
    const text = `<analysis>
      This is a
      multiline
      analysis
    </analysis>`;
    const result = processor.extractTagContent(text, "analysis");
    expect(result).toBe(`This is a
      multiline
      analysis`);
  });

  test("should wrap content in tags", () => {
    const content = "This is important";
    const result = processor.wrapInTags(content, "emphasis");
    expect(result).toBe("<emphasis>This is important</emphasis>");
  });

  test("should extract all matching tags from text", () => {
    const text = `
      <item>First item</item>
      Some text in between
      <item>Second item</item>
      More text
      <item>Third item</item>
    `;

    const pattern = /<item>(.*?)<\/item>/gs;
    const results = processor.extractAllTags(text, pattern);

    expect(results.length).toBe(3);
    expect(results).toContain("First item");
    expect(results).toContain("Second item");
    expect(results).toContain("Third item");
  });
});
