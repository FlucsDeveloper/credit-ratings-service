/**
 * Credit Ratings API v3
 * Global Credit Ratings Retrieval System
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { resolve } from '@/lib/entity/entity-resolver';
import { buildCandidates } from '@/lib/scraper/sources-v3';
import { multiSourceRetrieve } from '@/lib/retrieval/retriever';
import { merge } from '@/lib/fusion/fuse';
import { hybridExtract } from '@/lib/extraction/extractor';
import { normalizeEntries } from '@/services/normalize-v3';
import { validateFinal } from '@/lib/validation/validator-v3';
import { jlog } from '@/lib/util/log';

// CRITICAL: Playwright requires Node runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || searchParams.get('company');

  const traceId = randomUUID();
  const startTime = Date.now();
  const errors: string[] = [];

  // CRITICAL: Wrap everything to NEVER return 500
  try {
    // Validate input
    if (!query) {
      return NextResponse.json(
        {
          query: '',
          status: 'error',
          ratings: [],
          diagnostics: {
            urls_tried: [],
            sources_used: [],
            errors: ['Query parameter required (use ?q=<company>)'],
          },
          meta: {
            traceId,
            elapsedMs: 0,
          },
        },
        { status: 200 }
      );
    }

    jlog('api-v3', { event: 'start', query, traceId });

    // Step 1: Entity Resolution
    const entity = resolve(query);
    jlog('api-v3', { event: 'entity_resolved', legal_name: entity.legal_name, ticker: entity.ticker });

    // Step 2: Build candidate URLs
    const candidates = await buildCandidates(entity);
    jlog('api-v3', { event: 'candidates_built', count: candidates.length });

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          query,
          status: 'degraded',
          entity: {
            legal_name: entity.legal_name,
            ticker: entity.ticker,
            country: entity.country,
          },
          ratings: [],
          diagnostics: {
            urls_tried: [],
            sources_used: [],
            errors: ['No candidate URLs found'],
          },
          meta: {
            traceId,
            elapsedMs: Date.now() - startTime,
          },
        },
        { status: 200 }
      );
    }

    // Step 3: Retrieve content from multiple sources
    const retrieval = await multiSourceRetrieve(candidates, { budgetMs: 25000 });
    jlog('api-v3', { event: 'retrieval_complete', items_count: retrieval.items.length, urls_tried: retrieval.tried.length });

    if (retrieval.items.length === 0) {
      return NextResponse.json(
        {
          query,
          status: 'degraded',
          entity: {
            legal_name: entity.legal_name,
            ticker: entity.ticker,
            country: entity.country,
          },
          ratings: [],
          diagnostics: {
            urls_tried: retrieval.tried.slice(0, 10),
            sources_used: [],
            errors: ['No content retrieved'],
          },
          meta: {
            traceId,
            elapsedMs: Date.now() - startTime,
          },
        },
        { status: 200 }
      );
    }

    // Step 4: Fuse content
    const contentFusion = merge(retrieval);
    jlog('api-v3', { event: 'fusion_complete', text_bytes: contentFusion.bytes, parts: contentFusion.parts });

    // Step 5: Hybrid extraction (regex + LLM)
    const extraction = await hybridExtract(entity.legal_name, contentFusion.text);
    jlog('api-v3', { event: 'extraction_complete', entries_count: extraction.entries.length, used: extraction.used });

    // Step 6: Normalize ratings
    const normalized = normalizeEntries(extraction.entries);

    // Step 7: Validate
    const validation = validateFinal(normalized);
    jlog('api-v3', { event: 'validation_complete', confidence: validation.confidenceLevel, conflicts: validation.hasConflicts });

    // Step 8: Determine status
    let status: 'ok' | 'partial' | 'degraded' | 'error' = 'error';
    if (normalized.length >= 3 && validation.confidenceLevel === 'high') {
      status = 'ok';
    } else if (normalized.length >= 1) {
      status = 'partial';
    } else if (retrieval.items.length > 0) {
      status = 'degraded';
    }

    const elapsedMs = Date.now() - startTime;

    // Step 9: Build response
    const response = {
      query,
      status,
      entity: {
        legal_name: entity.legal_name,
        ticker: entity.ticker,
        country: entity.country,
        sector: entity.sector,
      },
      ratings: normalized.map((entry) => ({
        agency: entry.agency,
        rating_raw: entry.rating_raw,
        outlook: entry.outlook,
        as_of: entry.as_of,
        scale: entry.scale,
        confidence: entry.confidence,
        normalized_score: entry.normalized_score,
        isLocal: entry.isLocal,
      })),
      diagnostics: {
        urls_tried: retrieval.tried.slice(0, 10),
        sources_used: extraction.used,
        errors,
        textBytes: contentFusion.bytes,
        urlsTriedCount: retrieval.tried.length,
      },
      validation: {
        confidenceLevel: validation.confidenceLevel,
        hasConflicts: validation.hasConflicts,
        freshCount: validation.freshCount,
      },
      meta: {
        traceId,
        elapsedMs,
      },
    };

    jlog('api-v3', {
      event: 'complete',
      query,
      status,
      ratings_count: normalized.length,
      elapsedMs,
      traceId,
    });

    return NextResponse.json(response, { status: 200 });
  } catch (fatalError: any) {
    // CRITICAL: Even fatal errors return 200
    const elapsedMs = Date.now() - startTime;

    jlog('api-v3', {
      event: 'fatal_error',
      query: query || '',
      error: fatalError.message,
      elapsedMs,
      traceId,
    });

    return NextResponse.json(
      {
        query: query || '',
        status: 'error',
        ratings: [],
        diagnostics: {
          urls_tried: [],
          sources_used: [],
          errors: [`Fatal error: ${fatalError.message}`],
        },
        meta: {
          traceId,
          elapsedMs,
        },
      },
      { status: 200 }
    );
  }
}
