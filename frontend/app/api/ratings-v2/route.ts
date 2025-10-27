/**
 * Credit Ratings API v2
 * Production-grade endpoint with Public Data first, then vendor APIs, scraping, and AI fallback
 *
 * CRITICAL RULES:
 * - ALWAYS return HTTP 200 (never 500)
 * - Response time ≤10 seconds
 * - Return status: "ok" or "degraded"
 * - Fallback order: Public Data → Vendor → Scraping → LLM
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// Services
import { getPublicCreditRatings } from '@/services/publicData';
import { searchSPHeuristic, searchFitchHeuristic, searchMoodysHeuristic } from '@/services/fallback/heuristic';
import { createSummary, normalizeRating } from '@/services/normalize';
import { getCached, setCached, generateCacheKey } from '@/services/cache';
import { jlog, jlogStart, jlogEnd } from '@/lib/log';
import { scrapeMissingAgencies } from '@/lib/scraper/superscraper';
import { validateInstitutional, crossValidateAgencies, type RatingData, type ValidationResult } from '@/lib/validation/institutional-validator';
import { resolveTickerLATAM } from '@/lib/resolution/ticker-mapping';
import { extractRatingsBatch } from '@/lib/ai/extractRatingWithDeepSeek';
import { fetchHtml } from '@/lib/scraper/fetch';
import { fetchRenderedHtml, appearsJavaScriptRendered } from '@/lib/scraper/headless-fetch';

// Types
import { AgencyRating } from '@/services/types';

// CRITICAL: Playwright requires Node runtime (not Edge)
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Institutional-grade entity resolution
 * Priority: LATAM database → Global companies → Ticker pattern → Query as-is
 */
function resolveEntityLocal(query: string): { name: string; ticker?: string } {
  const normalized = query.trim().toLowerCase();

  // PRIORITY 1: Try LATAM database (BTG Pactual, Nubank, etc.)
  const latamCompany = resolveTickerLATAM(query);
  if (latamCompany) {
    jlog({
      component: 'entity-resolution',
      outcome: 'success',
      meta: {
        source: 'latam_database',
        company: latamCompany.legal_name,
        ticker: latamCompany.ticker,
        country: latamCompany.country
      }
    });
    return {
      name: latamCompany.legal_name,
      ticker: latamCompany.ticker
    };
  }

  // PRIORITY 2: Global companies (US, Europe, Asia)
  const knownCompanies: Record<string, { name: string; ticker: string }> = {
    'microsoft': { name: 'Microsoft Corporation', ticker: 'MSFT' },
    'apple': { name: 'Apple Inc.', ticker: 'AAPL' },
    'google': { name: 'Alphabet Inc.', ticker: 'GOOGL' },
    'alphabet': { name: 'Alphabet Inc.', ticker: 'GOOGL' },
    'amazon': { name: 'Amazon.com Inc.', ticker: 'AMZN' },
    'meta': { name: 'Meta Platforms Inc.', ticker: 'META' },
    'facebook': { name: 'Meta Platforms Inc.', ticker: 'META' },
    'tesla': { name: 'Tesla Inc.', ticker: 'TSLA' },
    'toyota': { name: 'Toyota Motor Corporation', ticker: '7203' },
    'boeing': { name: 'The Boeing Company', ticker: 'BA' },
    'walmart': { name: 'Walmart Inc.', ticker: 'WMT' },
    'jpmorgan': { name: 'JPMorgan Chase & Co.', ticker: 'JPM' },
    'exxon': { name: 'Exxon Mobil Corporation', ticker: 'XOM' },
    'chevron': { name: 'Chevron Corporation', ticker: 'CVX' },
    'coca-cola': { name: 'The Coca-Cola Company', ticker: 'KO' },
    'coke': { name: 'The Coca-Cola Company', ticker: 'KO' },
    'pepsi': { name: 'PepsiCo Inc.', ticker: 'PEP' },
    'intel': { name: 'Intel Corporation', ticker: 'INTC' },
  };

  for (const [key, value] of Object.entries(knownCompanies)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // PRIORITY 3: Ticker pattern detected (e.g., "MSFT", "BPAC11")
  if (/^[A-Z]{1,6}[0-9]{0,2}$/.test(query.trim())) {
    return { name: query.trim(), ticker: query.trim() };
  }

  // PRIORITY 4: Default - use query as-is (will try scraping IR pages)
  return { name: query.trim() };
}

/**
 * GET /api/ratings-v2?q=<query>
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || searchParams.get('company');

  const traceId = randomUUID();
  const globalStart = jlogStart('api-ratings-v2', query || undefined);
  const errors: string[] = [];
  const sources: string[] = [];

  // CRITICAL: Wrap everything in try-catch to NEVER return 500
  try {
    // Validate input
    if (!query) {
      jlogEnd('api-ratings-v2', globalStart, 'failed', ['Missing query parameter']);
      return NextResponse.json(
        {
          query: '',
          status: 'error',
          entity: { legal_name: '', ticker: '', isin: '', lei: '', country: '' },
          ratings: [],
          summary: { agenciesFound: 0, averageScore: null, category: 'Not Rated' as const },
          diagnostics: { sources: [], errors: ['Query parameter required (use ?q=<company>)'] },
          meta: { lastUpdated: new Date().toISOString(), sourcePriority: [], traceId },
        },
        { status: 200 }
      );
    }

    jlog({ component: 'api-ratings-v2', query, outcome: 'success', meta: { event: 'query_received', traceId } });

    // ===== STEP 1: LIGHTWEIGHT ENTITY RESOLUTION (NO LLM) =====
    const entityStart = jlogStart('entity-resolution', query);
    const entity = resolveEntityLocal(query);
    jlogEnd('entity-resolution', entityStart, 'success', undefined, { name: entity.name, ticker: entity.ticker });

    // ===== STEP 2: CHECK CACHE =====
    const cacheKey = generateCacheKey(query, undefined, undefined, entity.ticker);
    const cached = getCached(cacheKey);

    if (cached && !cached.stale) {
      jlog({ component: 'cache', query, outcome: 'success', meta: { event: 'hit_fresh', traceId } });
      return NextResponse.json({
        ...cached.data,
        meta: {
          ...cached.data.meta,
          traceId,
          fromCache: true,
        },
      });
    }

    if (cached?.stale) {
      jlog({ component: 'cache', query, outcome: 'degraded', meta: { event: 'hit_stale', traceId } });
    }

    // ===== STEP 3: FETCH RATINGS WITH STRICT TIME BUDGET (≤10s) =====
    jlog({ component: 'ratings-fetch', query, outcome: 'success', meta: { event: 'start_parallel', budget_ms: 10000 } });

    // Helper to enforce timeout
    const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, agency: string): Promise<T | null> => {
      return Promise.race([
        promise,
        new Promise<null>((resolve) => setTimeout(() => {
          errors.push(`${agency}: Timeout after ${timeoutMs}ms`);
          resolve(null);
        }, timeoutMs))
      ]);
    };

    // STEP 3A: Try Public Data FIRST (fastest, most reliable)
    const publicStart = jlogStart('public-data', query);
    let spRating: AgencyRating | null = null;
    let fitchRating: AgencyRating | null = null;
    let moodysRating: AgencyRating | null = null;

    try {
      const publicData = await getPublicCreditRatings(entity.name, entity.ticker);

      if (publicData.sp) {
        spRating = publicData.sp;
        spRating.rating_norm = normalizeRating(spRating.rating, spRating.scale);
        sources.push('Public Data (S&P)');
      }
      if (publicData.fitch) {
        fitchRating = publicData.fitch;
        fitchRating.rating_norm = normalizeRating(fitchRating.rating, fitchRating.scale);
        sources.push('Public Data (Fitch)');
      }
      if (publicData.moodys) {
        moodysRating = publicData.moodys;
        moodysRating.rating_norm = normalizeRating(moodysRating.rating, moodysRating.scale);
        sources.push('Public Data (Moody\'s)');
      }

      const foundCount = [publicData.sp, publicData.fitch, publicData.moodys].filter(Boolean).length;
      jlogEnd('public-data', publicStart, foundCount > 0 ? 'success' : 'skipped', undefined, { found: foundCount });
    } catch (publicError: any) {
      jlogEnd('public-data', publicStart, 'failed', [publicError.message]);
      errors.push(`Public Data: ${publicError.message}`);
    }

    // STEP 3B: LATAM Companies - Use DeepSeek with correct IR URLs
    const latamCompany = resolveTickerLATAM(query);
    if (latamCompany?.ir_url && (!spRating || !fitchRating || !moodysRating)) {
      const deepseekStart = jlogStart('deepseek-latam', query);

      try {
        jlog({
          component: 'deepseek-latam',
          query,
          outcome: 'success',
          meta: {
            event: 'fetching_ir_page',
            ir_url: latamCompany.ir_url,
            company: latamCompany.legal_name,
            country: latamCompany.country
          }
        });

        // Try to fetch the ratings-specific page first, fallback to homepage
        let html = '';
        let finalUrl = latamCompany.ir_url;
        let usedPlaywright = false;

        const ratingsPaths = ['/en/esg/credit-ratings', '/credit-ratings', '/ratings', '/classificacao-de-risco', ''];
        for (const path of ratingsPaths) {
          const testUrl = latamCompany.ir_url.replace(/\/$/, '') + path;
          try {
            const result = await fetchHtml(testUrl, 8000, true);
            if (result.html && result.html.length > 500) {
              html = result.html;
              finalUrl = result.finalUrl || testUrl;

              // Check if HTML appears to be JavaScript-rendered (incomplete)
              if (appearsJavaScriptRendered(html)) {
                jlog({
                  component: 'deepseek-latam',
                  query,
                  outcome: 'degraded',
                  meta: {
                    event: 'js_rendered_detected',
                    url: testUrl,
                    static_html_length: html.length,
                    action: 'using_playwright_fallback'
                  }
                });

                // Use Playwright to render JavaScript
                try {
                  const rendered = await fetchRenderedHtml(testUrl, 10000);
                  html = rendered.html;
                  finalUrl = rendered.finalUrl;
                  usedPlaywright = true;

                  jlog({
                    component: 'deepseek-latam',
                    query,
                    outcome: 'success',
                    meta: {
                      event: 'playwright_rendered',
                      url: testUrl,
                      rendered_html_length: html.length,
                      render_time_ms: rendered.renderTimeMs
                    }
                  });
                } catch (playwrightError: any) {
                  // Playwright failed, use static HTML as fallback
                  jlog({
                    component: 'deepseek-latam',
                    query,
                    outcome: 'degraded',
                    meta: {
                      event: 'playwright_failed',
                      error: playwrightError.message,
                      fallback: 'using_static_html'
                    }
                  });
                }
              }

              jlog({
                component: 'deepseek-latam',
                query,
                outcome: 'success',
                meta: {
                  event: 'found_ratings_page',
                  url: testUrl,
                  html_length: html.length,
                  used_playwright: usedPlaywright
                }
              });
              break;
            }
          } catch (e) {
            // Try next path
            continue;
          }
        }

        if (html && html.length > 100) {
          // Prepare batch extraction for missing ratings only
          const extractionTasks = [];
          if (!spRating) extractionTasks.push({ html, url: finalUrl || latamCompany.ir_url, agency: 'sp' as const });
          if (!fitchRating) extractionTasks.push({ html, url: finalUrl || latamCompany.ir_url, agency: 'fitch' as const });
          if (!moodysRating) extractionTasks.push({ html, url: finalUrl || latamCompany.ir_url, agency: 'moodys' as const });

          if (extractionTasks.length > 0) {
            const deepseekResults = await extractRatingsBatch(extractionTasks, latamCompany.legal_name);

            // Convert DeepSeek results to AgencyRating format
            for (const result of deepseekResults) {
              if (result.found && result.rating && result.confidence && result.confidence >= 0.7) {
                // Normalize agency name to standard format
                let normalizedAgency: string;
                let agencyCode: 'sp' | 'fitch' | 'moodys';

                const agencyLower = (result.agency || '').toLowerCase();
                if (agencyLower.includes('s&p') || agencyLower.includes('standard')) {
                  normalizedAgency = 'S&P Global';
                  agencyCode = 'sp';
                } else if (agencyLower.includes('fitch')) {
                  normalizedAgency = 'Fitch';
                  agencyCode = 'fitch';
                } else if (agencyLower.includes('moody')) {
                  normalizedAgency = "Moody's";
                  agencyCode = 'moodys';
                } else {
                  // Skip if agency not recognized
                  continue;
                }

                const agencyRating: AgencyRating = {
                  agency: normalizedAgency,
                  rating: result.rating,
                  outlook: result.outlook || undefined,
                  action: undefined,
                  date: result.date || new Date().toISOString().split('T')[0],
                  scale: agencyCode === 'moodys' ? "Moody's" : 'S&P/Fitch',
                  source_ref: result.source_ref || latamCompany.ir_url,
                };

                agencyRating.rating_norm = normalizeRating(agencyRating.rating, agencyRating.scale);

                // Apply only if not already found
                if (agencyCode === 'sp' && !spRating) {
                  spRating = agencyRating;
                  sources.push(`DeepSeek AI (S&P) - ${(result.confidence * 100).toFixed(0)}% confidence`);
                } else if (agencyCode === 'fitch' && !fitchRating) {
                  fitchRating = agencyRating;
                  sources.push(`DeepSeek AI (Fitch) - ${(result.confidence * 100).toFixed(0)}% confidence`);
                } else if (agencyCode === 'moodys' && !moodysRating) {
                  moodysRating = agencyRating;
                  sources.push(`DeepSeek AI (Moody's) - ${(result.confidence * 100).toFixed(0)}% confidence`);
                }

                jlog({
                  component: 'deepseek-latam',
                  query,
                  outcome: 'success',
                  meta: {
                    agency: result.agency,
                    rating: result.rating,
                    confidence: result.confidence,
                    local_notation: /\(bra\)|\(col\)|\(mex\)|\(arg\)|\.mx|\.br|\.co/.test(result.rating || '')
                  }
                });
              }
            }

            const deepseekCount = deepseekResults.filter(r => r.found && r.confidence && r.confidence >= 0.7).length;
            jlogEnd('deepseek-latam', deepseekStart, deepseekCount > 0 ? 'success' : 'skipped', undefined, {
              found: deepseekCount,
              total_tasks: extractionTasks.length
            });
          } else {
            jlogEnd('deepseek-latam', deepseekStart, 'skipped', undefined, { reason: 'all_ratings_found' });
          }
        } else {
          jlogEnd('deepseek-latam', deepseekStart, 'failed', ['HTML too short or empty']);
          errors.push(`DeepSeek LATAM: IR page HTML too short`);
        }

      } catch (deepseekError: any) {
        jlogEnd('deepseek-latam', deepseekStart, 'failed', [deepseekError.message]);
        errors.push(`DeepSeek LATAM: ${deepseekError.message}`);
      }
    }

    // STEP 3C: If still missing any ratings, try UniversalScraper with LLM discovery
    if (!spRating || !fitchRating || !moodysRating) {
      const scraperStart = jlogStart('universal-scraper', query);

      try {
        // Get IR URL if available from LATAM database
        const irUrl = latamCompany?.ir_url || undefined;

        const scrapedRatings = await scrapeMissingAgencies(
          {
            name: entity.name,
            ticker: entity.ticker,
            isin: undefined,
            lei: undefined,
            country: latamCompany?.country || undefined,
          },
          {
            sp: spRating,
            fitch: fitchRating,
            moodys: moodysRating,
          },
          {
            timeoutMs: 3000,  // 3s per agency
            maxUrls: 8,       // Increased to allow more LLM-discovered URLs
            useLLMFallback: true,
            useLLMDiscovery: true,  // NEW: Enable LLM-assisted URL discovery
            irUrl: irUrl,           // NEW: Pass IR URL from database
          }
        );

        // Apply scraped ratings (only if not already found)
        if (scrapedRatings.sp && !spRating) {
          spRating = scrapedRatings.sp;
          spRating.rating_norm = normalizeRating(spRating.rating, spRating.scale);
          sources.push('UniversalScraper (S&P)');
        }
        if (scrapedRatings.fitch && !fitchRating) {
          fitchRating = scrapedRatings.fitch;
          fitchRating.rating_norm = normalizeRating(fitchRating.rating, fitchRating.scale);
          sources.push('UniversalScraper (Fitch)');
        }
        if (scrapedRatings.moodys && !moodysRating) {
          moodysRating = scrapedRatings.moodys;
          moodysRating.rating_norm = normalizeRating(moodysRating.rating, moodysRating.scale);
          sources.push('UniversalScraper (Moody\'s)');
        }

        const scrapedCount = [scrapedRatings.sp, scrapedRatings.fitch, scrapedRatings.moodys].filter(Boolean).length;
        jlogEnd('universal-scraper', scraperStart, scrapedCount > 0 ? 'success' : 'skipped', undefined, { found: scrapedCount });

      } catch (scraperError: any) {
        jlogEnd('universal-scraper', scraperStart, 'failed', [scraperError.message]);
        errors.push(`UniversalScraper: ${scraperError.message}`);
      }
    }

    // STEP 3D: If still missing any ratings, try heuristic fallback (includes LLM)
    const missingAgencies = [];
    if (!spRating) missingAgencies.push('S&P');
    if (!fitchRating) missingAgencies.push('Fitch');
    if (!moodysRating) missingAgencies.push('Moody\'s');

    if (missingAgencies.length > 0) {
      jlog({
        component: 'heuristic-fallback',
        query,
        outcome: 'success',
        meta: { event: 'start', missing: missingAgencies, budget_ms: 8000 }
      });

      // Construct identifiers for heuristic functions
      const identifiers = {
        name: entity.name,
        ticker: entity.ticker,
        isin: undefined,
        lei: undefined,
        country: undefined,
      };

      // Run heuristics in parallel with 8s timeout (2s buffer from 10s total)
      const [spHeuristic, fitchHeuristic, moodysHeuristic] = await Promise.allSettled([
        !spRating ? withTimeout(
          searchSPHeuristic(identifiers).catch(err => {
            errors.push(`S&P Heuristic: ${err.message}`);
            return null;
          }),
          8000,
          'S&P'
        ) : Promise.resolve(null),

        !fitchRating ? withTimeout(
          searchFitchHeuristic(identifiers).catch(err => {
            errors.push(`Fitch Heuristic: ${err.message}`);
            return null;
          }),
          8000,
          'Fitch'
        ) : Promise.resolve(null),

        !moodysRating ? withTimeout(
          searchMoodysHeuristic(identifiers).catch(err => {
            errors.push(`Moody's Heuristic: ${err.message}`);
            return null;
          }),
          8000,
          'Moody\'s'
        ) : Promise.resolve(null),
      ]);

      // Process heuristic results
      if (spHeuristic.status === 'fulfilled' && spHeuristic.value) {
        spRating = spHeuristic.value;
        spRating.rating_norm = normalizeRating(spRating.rating, spRating.scale);
        sources.push('Heuristic Fallback (S&P)');
      }

      if (fitchHeuristic.status === 'fulfilled' && fitchHeuristic.value) {
        fitchRating = fitchHeuristic.value;
        fitchRating.rating_norm = normalizeRating(fitchRating.rating, fitchRating.scale);
        sources.push('Heuristic Fallback (Fitch)');
      }

      if (moodysHeuristic.status === 'fulfilled' && moodysHeuristic.value) {
        moodysRating = moodysHeuristic.value;
        moodysRating.rating_norm = normalizeRating(moodysRating.rating, moodysRating.scale);
        sources.push('Heuristic Fallback (Moody\'s)');
      }
    }

    // ===== STEP 4: BUILD RATINGS ARRAY =====
    const ratings: AgencyRating[] = [spRating, fitchRating, moodysRating].filter((r): r is AgencyRating => r !== null);

    // ===== STEP 5: CALCULATE SUMMARY =====
    const summary = createSummary(ratings);

    // ===== STEP 5.5: INSTITUTIONAL VALIDATION (Audit Trail + Data Integrity) =====
    const validationStart = jlogStart('institutional-validation', query);
    const validationResults: Record<string, ValidationResult> = {};
    const auditTrails: any[] = [];

    // Validate each rating individually
    for (const rating of ratings) {
      const ratingData: RatingData = {
        agency: rating.agency,
        rating: rating.rating,
        outlook: rating.outlook,
        date: rating.date,
        source_ref: rating.source || 'Unknown',
        method: (sources.some(s => s.includes('Public Data')) ? 'public_data' :
                 sources.some(s => s.includes('UniversalScraper')) ? 'regex' :
                 'llm') as 'regex' | 'llm' | 'public_data' | 'vendor_api'
      };

      const validation = validateInstitutional(ratingData, {
        requireDate: false, // Optional for institutional use
        maxAgeDays: 365,
        requireSourceRef: true
      });

      validationResults[rating.agency] = validation;
      auditTrails.push(...validation.auditTrail);

      // Log validation warnings/errors
      if (validation.warnings.length > 0) {
        jlog({
          component: 'institutional-validation',
          query,
          outcome: 'degraded',
          meta: { agency: rating.agency, warnings: validation.warnings }
        });
      }
      if (!validation.isValid) {
        jlog({
          component: 'institutional-validation',
          query,
          outcome: 'failed',
          meta: { agency: rating.agency, errors: validation.errors }
        });
      }
    }

    // Cross-validate agencies for consistency
    let crossValidation = null;
    if (ratings.length >= 2) {
      const ratingDataArray: RatingData[] = ratings.map(r => ({
        agency: r.agency,
        rating: r.rating,
        outlook: r.outlook,
        date: r.date,
        source_ref: r.source || 'Unknown',
        method: 'public_data' as const
      }));

      crossValidation = crossValidateAgencies(ratingDataArray);

      if (!crossValidation.consistent) {
        jlog({
          component: 'cross-validation',
          query,
          outcome: 'degraded',
          meta: { issues: crossValidation.issues }
        });
      }
    }

    jlogEnd('institutional-validation', validationStart, 'success', undefined, {
      total_validations: Object.keys(validationResults).length,
      all_valid: Object.values(validationResults).every(v => v.isValid),
      cross_validation_passed: crossValidation?.consistent ?? true
    });

    // ===== STEP 6: DETERMINE STATUS =====
    // CRITICAL: Use "ok", "degraded", or "error" only
    const status: "ok" | "degraded" | "error" = ratings.length === 3 ? "ok" : ratings.length > 0 ? "degraded" : "error";

    // ===== STEP 7: BUILD RESPONSE =====
    const response = {
      query,
      status,
      entity: {
        legal_name: entity.name,
        ticker: entity.ticker || '',
        isin: '',
        lei: '',
        country: '',
      },
      ratings,
      summary,
      diagnostics: {
        sources: Array.from(new Set(sources)),
        errors,
      },
      validation: {
        results: validationResults,
        crossAgencyValidation: crossValidation,
        auditTrail: auditTrails,
        overallConfidence: Object.values(validationResults).every(v => v.confidence === 'high') ? 'high' :
                          Object.values(validationResults).every(v => v.confidence !== 'rejected') ? 'medium' : 'low',
        allValid: Object.values(validationResults).every(v => v.isValid)
      },
      meta: {
        lastUpdated: new Date().toISOString(),
        sourcePriority: Array.from(new Set(sources)),
        traceId,
      },
    };

    // ===== STEP 8: CACHE RESPONSE (6h TTL) =====
    setCached(cacheKey, response);

    // ===== FINAL LOG =====
    const totalTime = Date.now() - globalStart;
    jlogEnd('api-ratings-v2', globalStart, status === 'ok' ? 'success' : status === 'degraded' ? 'degraded' : 'failed', errors.length > 0 ? errors : undefined, {
      agencies_found: ratings.length,
      avg_score: summary.averageScore,
      total_ms: totalTime,
    });

    // CRITICAL: ALWAYS return 200
    return NextResponse.json(response, { status: 200 });

  } catch (fatalError: any) {
    // CRITICAL: Even fatal errors return 200 with degraded status
    const totalTime = Date.now() - globalStart;
    jlogEnd('api-ratings-v2', globalStart, 'failed', [fatalError.message], { fatal: true, total_ms: totalTime });

    return NextResponse.json(
      {
        query: query || '',
        status: 'error',
        entity: { legal_name: '', ticker: '', isin: '', lei: '', country: '' },
        ratings: [],
        summary: { agenciesFound: 0, averageScore: null, category: 'Not Rated' as const },
        diagnostics: {
          sources: [],
          errors: [`Fatal error: ${fatalError.message}`],
        },
        meta: {
          lastUpdated: new Date().toISOString(),
          sourcePriority: [],
          traceId,
        },
      },
      { status: 200 }
    );
  }
}

/**
 * Cache stats endpoint
 */
export async function OPTIONS(request: NextRequest) {
  try {
    const { getCacheStats } = await import('@/services/cache');
    const stats = getCacheStats();

    return NextResponse.json({
      cache: stats,
      timestamp: new Date().toISOString(),
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      error: 'Failed to get cache stats',
      message: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 200 });
  }
}
