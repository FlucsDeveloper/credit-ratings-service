/**
 * Evidence Extraction
 *
 * Extracts visible text + structured data (LD+JSON, __NEXT_DATA__) from HTML.
 * Used as input for windowing and scoring.
 */

import * as cheerio from "cheerio";

export interface ExtractedEvidence {
  visibleText: string;
  structuredData: any[];
  metadata: {
    title?: string;
    description?: string;
    url: string;
    textLength: number;
    hasStructured: boolean;
  };
}

/**
 * Extract evidence from HTML
 * @param html Raw HTML content
 * @param url Source URL
 * @returns Extracted evidence with visible text and structured data
 */
export function extractEvidence(html: string, url: string): ExtractedEvidence {
  const $ = cheerio.load(html);

  // Remove script, style, and nav elements
  $("script, style, nav, header, footer, aside, .nav, .menu, .sidebar").remove();

  // Extract visible text
  const visibleText = $("body").text().trim();

  // Extract structured data (LD+JSON)
  const structuredData: any[] = [];

  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const jsonText = $(elem).html() || "";
      const parsed = JSON.parse(jsonText);
      structuredData.push(parsed);
    } catch (error) {
      // Ignore parse errors
    }
  });

  // Extract __NEXT_DATA__ (Next.js apps)
  $("#__NEXT_DATA__").each((_, elem) => {
    try {
      const jsonText = $(elem).html() || "";
      const parsed = JSON.parse(jsonText);
      structuredData.push({ __NEXT_DATA__: parsed });
    } catch (error) {
      // Ignore parse errors
    }
  });

  // Extract metadata
  const title = $("title").text().trim();
  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  return {
    visibleText: normalizeWhitespace(visibleText),
    structuredData,
    metadata: {
      title,
      description,
      url,
      textLength: visibleText.length,
      hasStructured: structuredData.length > 0,
    },
  };
}

/**
 * Normalize whitespace in text
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ") // Multiple spaces → single space
    .replace(/\n\s*\n/g, "\n") // Multiple newlines → single newline
    .trim();
}

/**
 * Check if extracted text is too small (likely JavaScript-rendered)
 * @param evidence Extracted evidence
 * @param minLength Minimum text length (default: 500)
 * @returns True if text is too small
 */
export function isTextTooSmall(evidence: ExtractedEvidence, minLength = 500): boolean {
  return evidence.metadata.textLength < minLength;
}

/**
 * Extract specific sections by CSS selector
 * Useful for targeted extraction from known page structures
 */
export function extractSection(html: string, selector: string): string {
  const $ = cheerio.load(html);
  const section = $(selector).text().trim();
  return normalizeWhitespace(section);
}

/**
 * Batch extract evidence from multiple HTML sources
 */
export function extractEvidenceBatch(
  htmlSources: Array<{ html: string; url: string }>
): ExtractedEvidence[] {
  return htmlSources.map(({ html, url }) => extractEvidence(html, url));
}
