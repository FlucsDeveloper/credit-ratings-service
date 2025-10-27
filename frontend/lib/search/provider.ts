/**
 * SerpAPI Search Provider
 *
 * Provides web search functionality using SerpAPI Google engine.
 * Returns de-duplicated, absolute URLs only.
 */

import { getJson } from "serpapi";

export interface SearchOptions {
  limit?: number;
  region?: string;
  safe?: boolean;
}

/**
 * Search the web using SerpAPI
 * @param q Search query
 * @param limit Maximum number of results (default: 10)
 * @returns Array of absolute URLs
 */
export async function searchWeb(q: string, limit = 10): Promise<string[]> {
  const key = process.env.SERPAPI_API_KEY;

  if (!key || key === "REPLACE") {
    console.warn("[search-provider] SERPAPI_API_KEY not configured");
    return [];
  }

  try {
    const params: any = {
      engine: "google",
      q,
      num: Math.min(limit, 10), // SerpAPI max per request
      hl: "en",
      gl: "us",
      safe: "active",
      api_key: key,
    };

    const response = await getJson(params);
    const organicResults = response?.organic_results ?? [];

    // Extract URLs, filter and de-duplicate
    const urls = organicResults
      .map((r: any) => r.link as string)
      .filter((url: string) => {
        if (!url) return false;

        // Only http/https
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          return false;
        }

        // Filter out common non-content URLs
        const excludePatterns = [
          /accounts\./i,
          /login/i,
          /signin/i,
          /paywall/i,
          /subscribe/i,
          /tracking\./i,
          /doubleclick\./i,
        ];

        return !excludePatterns.some(pattern => pattern.test(url));
      })
      .map(cleanTrackingParams);

    // De-duplicate
    const uniqueUrls = Array.from(new Set(urls));

    console.log(`[search-provider] Query: "${q}" → ${uniqueUrls.length} unique URLs`);

    return uniqueUrls.slice(0, limit);
  } catch (error) {
    console.error(`[search-provider] Error searching: ${q}`, error);
    return [];
  }
}

/**
 * Remove common tracking parameters from URLs
 */
function cleanTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
      "_ga",
    ];

    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });

    return urlObj.toString();
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}

/**
 * Search with multiple queries and combine results
 */
export async function multiSearch(queries: string[], limitPerQuery = 5): Promise<string[]> {
  const results = await Promise.all(
    queries.map(q => searchWeb(q, limitPerQuery))
  );

  // Flatten and de-duplicate
  const allUrls = results.flat();
  return Array.from(new Set(allUrls));
}
