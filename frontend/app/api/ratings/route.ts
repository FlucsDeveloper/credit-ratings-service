/**
 * Credit Ratings API v1.1 - Main Entry Point
 *
 * PRD v1.1 Implementation:
 * - Multi-agency search (Moody's, S&P, Fitch)
 * - SerpAPI + Deepseek LLM integration
 * - SQLite cache with 7-day TTL
 * - Per-agency status: found|not_found|blocked
 * - Confidence scoring with truth constraints
 *
 * Query: GET /api/ratings?q=<company_name_or_ticker>
 * Response: { agencies: { moodys, sp, fitch }, metadata, cached }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveEntity } from "@/lib/validation/entity";
import { searchAgency } from "@/lib/search/agency-search";
import { fetchHtml } from "@/lib/scraper/fetch";
import { extractEvidence, isTextTooSmall } from "@/lib/evidence/extract";
import { ratingActionWindows } from "@/lib/evidence/windowing";
import { verifyTruth, type TruthInput } from "@/lib/validation/truth-constraints";
import { getCache } from "@/lib/cache/sqlite-cache";
import { jlog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // 30s timeout

type AgencyName = "moodys" | "sp" | "fitch";

interface AgencyResult {
  agency: AgencyName;
  status: "found" | "not_found" | "blocked";
  rating: string | null;
  outlook: string | null;
  date: string | null;
  source_url: string | null;
  confidence: number;
}

interface RatingsResponse {
  agencies: {
    moodys: AgencyResult;
    sp: AgencyResult;
    fitch: AgencyResult;
  };
  metadata: {
    query: string;
    canonical_name: string;
    aliases: string[];
    searched_at: string;
    latency_ms: number;
    cached: boolean;
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const cache = getCache();

  try {
    cache.incrementMetric("requests_total");

    // Parse query
    const query = request.nextUrl.searchParams.get("q");
    if (!query) {
      return NextResponse.json({ error: "Missing query parameter 'q'" }, { status: 400 });
    }

    jlog({ component: "api-ratings", event: "request", meta: { query } });

    // Check cache first
    const cacheKey = `ratings:${query.toLowerCase()}`;
    const cached = cache.get<RatingsResponse>(cacheKey);

    if (cached) {
      jlog({ component: "api-ratings", event: "cache_hit", meta: { query } });
      return NextResponse.json({ ...cached, metadata: { ...cached.metadata, cached: true } });
    }

    // Step 1: Entity resolution (expand aliases via deterministic + LLM)
    const entity = await resolveEntity(query);
    jlog({
      component: "api-ratings",
      event: "entity_resolved",
      meta: { canonical: entity.legal_name, aliases: entity.aliases.length },
    });

    // Step 2: Search for evidence URLs (Tier 1-4 strategy)
    const searchResults = await searchAgency(entity.aliases, 24);
    cache.incrementMetric("search_results_total", searchResults.length);
    jlog({
      component: "api-ratings",
      event: "search_complete",
      meta: { urls: searchResults.length },
    });

    if (searchResults.length === 0) {
      const emptyResponse = buildEmptyResponse(query, entity.legal_name, entity.aliases);
      cache.set(cacheKey, emptyResponse, 7);
      return NextResponse.json(emptyResponse);
    }

    // Step 3: Fetch HTML concurrently (limit to 24 URLs, concurrency=3)
    const agencies: Record<AgencyName, AgencyResult> = {
      moodys: buildNotFound("moodys"),
      sp: buildNotFound("sp"),
      fitch: buildNotFound("fitch"),
    };

    const urlBatches = batchArray(searchResults.slice(0, 24), 3);

    for (const batch of urlBatches) {
      const fetchPromises = batch.map(async ({ url }) => {
        try {
          const result = await fetchHtml(url, 8000, true); // 8s timeout

          if (result.status === 403) {
            // Track 403 blocking
            const agencyName = detectAgency(url);
            if (agencyName && agencies[agencyName].status === "not_found") {
              agencies[agencyName] = { ...agencies[agencyName], status: "blocked" };
              cache.incrementMetric("blocked_403_count");
            }
            return null;
          }

          if (result.status !== 200 || !result.html) {
            return null;
          }

          return { url, html: result.html };
        } catch (error) {
          jlog({ component: "api-ratings", event: "fetch_error", meta: { url, error } });
          return null;
        }
      });

      const fetchResults = (await Promise.all(fetchPromises)).filter(Boolean) as Array<{
        url: string;
        html: string;
      }>;

      // Step 4: Extract evidence, window, score
      for (const { url, html } of fetchResults) {
        const evidence = extractEvidence(html, url);

        // Trigger headless fallback if text too small (< 500 chars)
        if (isTextTooSmall(evidence, 500)) {
          jlog({ component: "api-ratings", event: "text_too_small", meta: { url } });
          continue; // Skip or implement headless fetch here
        }

        // Generate windows
        const windows = ratingActionWindows(evidence.visibleText, entity.aliases, 12);
        cache.incrementMetric("evidence_windows_total", windows.length);

        if (windows.length === 0) {
          continue;
        }

        // Score each window
        for (const window of windows) {
          const extracted = extractRatingFromWindow(window);
          if (!extracted) continue;

          const agencyName = detectAgency(url);
          if (!agencyName) continue;

          // Verify truth constraints
          const truthInput: TruthInput = {
            company: entity.legal_name,
            aliases: entity.aliases,
            domain: new URL(url).hostname,
            url,
            window,
            entry: {
              agency: extracted.agency,
              rating_raw: extracted.rating,
              outlook: extracted.outlook,
              as_of: extracted.date,
              confidence: extracted.confidence,
            },
          };

          const truthResult = verifyTruth(truthInput);

          if (!truthResult.accept) {
            cache.incrementMetric("filtered_out_total");
            continue;
          }

          // Accept if confidence meets threshold and better than existing
          if (
            truthResult.adjustedConfidence >= 0.75 &&
            truthResult.adjustedConfidence > agencies[agencyName].confidence
          ) {
            agencies[agencyName] = {
              agency: agencyName,
              status: "found",
              rating: extracted.rating,
              outlook: extracted.outlook,
              date: extracted.date,
              source_url: url,
              confidence: truthResult.adjustedConfidence,
            };

            jlog({
              component: "api-ratings",
              event: "rating_found",
              meta: { agency: agencyName, rating: extracted.rating, confidence: truthResult.adjustedConfidence },
            });
          }
        }
      }
    }

    // Step 5: Build response
    const response: RatingsResponse = {
      agencies,
      metadata: {
        query,
        canonical_name: entity.legal_name,
        aliases: entity.aliases.slice(0, 10), // Limit to 10 for response size
        searched_at: new Date().toISOString(),
        latency_ms: Date.now() - startTime,
        cached: false,
      },
    };

    // Cache for 7 days
    cache.set(cacheKey, response, 7);

    jlog({
      component: "api-ratings",
      event: "complete",
      meta: {
        query,
        latency: response.metadata.latency_ms,
        found: Object.values(agencies).filter(a => a.status === "found").length,
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    jlog({ component: "api-ratings", event: "error", meta: { error } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Helper: Detect agency from URL
 */
function detectAgency(url: string): AgencyName | null {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes("moodys.com")) return "moodys";
  if (hostname.includes("spglobal.com") || hostname.includes("standardandpoors")) return "sp";
  if (hostname.includes("fitchratings.com")) return "fitch";

  return null;
}

/**
 * Helper: Extract rating from window (basic regex)
 */
function extractRatingFromWindow(window: string): {
  agency: string | null;
  rating: string | null;
  outlook: string | null;
  date: string | null;
  confidence: number;
} | null {
  // Basic rating patterns (Moody's: Aa1, Baa2; S&P/Fitch: AAA, BBB+)
  const ratingMatch = window.match(
    /\b([A-C][a-c]{0,2}[1-3]?[\+\-]?|AAA|AA[\+\-]?|A[\+\-]?|BBB[\+\-]?|BB[\+\-]?|B[\+\-]?|CCC[\+\-]?|CC|C|D)\b/
  );

  // Outlook patterns
  const outlookMatch = window.match(/outlook\s+(stable|positive|negative|developing|watch)/i);

  // Date patterns (ISO or common formats)
  const dateMatch = window.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/);

  if (!ratingMatch) return null;

  return {
    agency: null, // Will be determined by URL
    rating: ratingMatch[1],
    outlook: outlookMatch ? outlookMatch[1] : null,
    date: dateMatch ? dateMatch[1] : null,
    confidence: 0.8, // Base confidence (will be adjusted by truth constraints)
  };
}

/**
 * Helper: Build not_found result
 */
function buildNotFound(agency: AgencyName): AgencyResult {
  return {
    agency,
    status: "not_found",
    rating: null,
    outlook: null,
    date: null,
    source_url: null,
    confidence: 0,
  };
}

/**
 * Helper: Build empty response when no search results
 */
function buildEmptyResponse(query: string, canonicalName: string, aliases: string[]): RatingsResponse {
  return {
    agencies: {
      moodys: buildNotFound("moodys"),
      sp: buildNotFound("sp"),
      fitch: buildNotFound("fitch"),
    },
    metadata: {
      query,
      canonical_name: canonicalName,
      aliases: aliases.slice(0, 10),
      searched_at: new Date().toISOString(),
      latency_ms: 0,
      cached: false,
    },
  };
}

/**
 * Helper: Split array into batches
 */
function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}
