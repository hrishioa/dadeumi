import { XMLParser, XMLBuilder } from "fast-xml-parser";

/**
 * Utility for working with XML tags in translation outputs
 */
export class XmlProcessor {
  private parser: XMLParser;
  private builder: XMLBuilder;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      preserveOrder: true,
    });

    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      preserveOrder: true,
    });
  }

  /**
   * Extract content from XML tags
   * @param text Text containing XML tags
   * @param tagName Name of the tag to extract (without angle brackets)
   * @returns The content of the tag, or empty string if tag not found
   */
  extractTagContent(text: string, tagName: string): string {
    // First try with regular expression that matches complete tags
    const regex = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, "s");
    const match = regex.exec(text);

    if (match && match[1]) {
      return match[1].trim();
    }

    // If no complete tag is found, check if there's just an opening tag (truncation case)
    const openTagRegex = new RegExp(`<${tagName}>(.*)$`, "s");
    const openTagMatch = openTagRegex.exec(text);

    if (openTagMatch && openTagMatch[1]) {
      console.warn(
        `Warning: Found opening <${tagName}> tag but no closing tag. The response might be truncated.`
      );
      return openTagMatch[1].trim();
    }

    // If tag not found, return empty string
    console.warn(`Warning: Tag <${tagName}> not found in the text.`);
    return "";
  }

  /**
   * Extract all matching tags from a text
   * @param text Text containing XML tags
   * @param pattern Regular expression pattern to match
   * @returns Array of tag contents
   */
  extractAllTags(text: string, pattern: RegExp): string[] {
    const matches = text.match(pattern);
    if (!matches) return [];

    // Extract the content from each tag match using capture groups
    return matches.map((match) => {
      // Extract just the content between tags
      const contentMatch = match.match(/>(.*?)</);
      if (contentMatch && contentMatch[1]) {
        return contentMatch[1].trim();
      }
      return match.trim();
    });
  }

  /**
   * Parse XML string to object
   */
  parseXml(xmlString: string): any {
    try {
      return this.parser.parse(`<root>${xmlString}</root>`);
    } catch (error) {
      console.error("Error parsing XML:", error);
      return null;
    }
  }

  /**
   * Build XML string from object
   */
  buildXml(obj: any): string {
    try {
      return this.builder.build(obj);
    } catch (error) {
      console.error("Error building XML:", error);
      return "";
    }
  }

  /**
   * Wrap content in XML tags
   */
  wrapInTags(content: string, tagName: string): string {
    return `<${tagName}>${content}</${tagName}>`;
  }
}
