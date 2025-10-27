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
import { generateDirectAgencyURLs, generateIRPageURLs } from "@/lib/search/direct-urls";
import { fetchHtml } from "@/lib/scraper/fetch";
import { fetchRenderedHtml } from "@/lib/scraper/headless-fetch";
import { extractEvidence, isTextTooSmall } from "@/lib/evidence/extract";
import { ratingActionWindows } from "@/lib/evidence/windowing";
import { verifyTruth, type TruthInput } from "@/lib/validation/truth-constraints";
import { extractRatingWithDeepSeek } from "@/lib/ai/extractRatingWithDeepSeek";
import { getCache } from "@/lib/cache/sqlite-cache";
import { jlog } from "@/lib/log";

export const runtime = "nodejs"; // Required for Playwright
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Increase to 60s for headless rendering

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

    // Step 2: Get URLs from search (prioritizing IR/newswires per PRD)
    // Per PRD: "use issuer IR and reputable newswires as mirrors when agencies block"
    // Search strategy now prioritizes IR/newswires in tiers 1-2, agencies in tier 3
    const searchResults = await searchAgency(entity.aliases, 20);

    // Only use IR URLs as supplementary (search already covers this)
    const irURLs = generateIRPageURLs(entity.legal_name, entity.hints?.tickers?.[0]);

    // Combine URLs: search results first (already tiered), then supplementary IR
    const allURLs = [
      ...searchResults.map(r => ({ url: r.url, priority: 1 })),
      ...irURLs.map(url => ({ url, priority: 2 })),
    ];

    // De-duplicate and sort by priority
    const uniqueURLs = Array.from(
      new Map(allURLs.map(item => [item.url, item])).values()
    ).sort((a, b) => a.priority - b.priority);

    cache.incrementMetric("search_results_total", uniqueURLs.length);
    jlog({
      component: "api-ratings",
      event: "urls_collected",
      meta: {
        search: searchResults.length,
        ir_supplement: irURLs.length,
        total: uniqueURLs.length,
      },
    });

    if (uniqueURLs.length === 0) {
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

    const urlBatches = batchArray(uniqueURLs.slice(0, 24).map(u => u.url), 3);

    for (const batch of urlBatches) {
      const fetchPromises = batch.map(async (url: string) => {
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

      // Step 4: Extract evidence using AI (with headless fallback)
      for (const { url, html: initialHtml } of fetchResults) {
        let html = initialHtml;
        let evidence = extractEvidence(html, url);

        // Trigger headless fallback if text too small (< 500 chars)
        if (isTextTooSmall(evidence, 500)) {
          jlog({ component: "api-ratings", event: "text_too_small_triggering_headless", meta: { url } });

          try {
            const headlessResult = await fetchRenderedHtml(url, 10000);
            html = headlessResult.html;
            evidence = extractEvidence(html, url);

            jlog({ component: "api-ratings", event: "headless_success", meta: { url, textLength: evidence.metadata.textLength } });
          } catch (error) {
            jlog({ component: "api-ratings", event: "headless_failed", meta: { url, error } });
            continue; // Skip this URL if headless fails
          }
        }

        // Use AI extractor instead of basic regex
        const agencyName = detectAgency(url);
        if (!agencyName) {
          jlog({ component: "api-ratings", event: "agency_not_detected", meta: { url } });
          continue;
        }

        try {
          // Use existing AI extractor
          const aiResult = await extractRatingWithDeepSeek(
            evidence.visibleText.slice(0, 8000), // Limit to 8K chars for LLM
            entity.legal_name,
            { agency: agencyName, maxTokens: 500, temperature: 0.1 }
          );

          if (!aiResult.found || !aiResult.rating) {
            jlog({ component: "api-ratings", event: "ai_no_rating", meta: { url, agency: agencyName } });
            continue;
          }

          const confidence = aiResult.confidence || 0.8;

          // Verify truth constraints
          const truthInput: TruthInput = {
            company: entity.legal_name,
            aliases: entity.aliases,
            domain: new URL(url).hostname,
            url,
            window: aiResult.source_snippet || evidence.visibleText.slice(0, 500),
            entry: {
              agency: aiResult.agency || agencyName,
              rating_raw: aiResult.rating,
              outlook: aiResult.outlook,
              as_of: aiResult.date,
              confidence,
            },
          };

          const truthResult = verifyTruth(truthInput);

          if (!truthResult.accept) {
            cache.incrementMetric("filtered_out_total");
            jlog({ component: "api-ratings", event: "truth_check_failed", meta: { url, agency: agencyName, reason: truthResult.reason } });
            continue;
          }

          // Accept if confidence meets threshold and better than existing
          if (
            truthResult.adjustedConfidence >= 0.60 && // Lower threshold for AI extraction
            truthResult.adjustedConfidence > agencies[agencyName].confidence
          ) {
            agencies[agencyName] = {
              agency: agencyName,
              status: "found",
              rating: aiResult.rating,
              outlook: aiResult.outlook || null,
              date: aiResult.date || null,
              source_url: url,
              confidence: truthResult.adjustedConfidence,
            };

            jlog({
              component: "api-ratings",
              event: "rating_found",
              meta: {
                agency: agencyName,
                rating: aiResult.rating,
                confidence: truthResult.adjustedConfidence,
                method: "ai_extraction"
              },
            });
          }
        } catch (error) {
          jlog({ component: "api-ratings", event: "ai_extraction_error", meta: { url, error } });
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
