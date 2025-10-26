/**
 * Universal Finder API Endpoint
 * GET /api/find?q=<company>
 *
 * Discovers canonical URLs for credit rating agencies
 * CRITICAL: Always returns HTTP 200 (never 500)
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { find } from '@/lib/finder/finder';
import { jlog, jlogStart, jlogEnd } from '@/lib/log';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/find?q=<company>
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  const traceId = randomUUID();
  const globalStart = jlogStart('api-find', query || undefined);

  // CRITICAL: Wrap everything in try-catch to NEVER return 500
  try {
    // Validate input
    if (!query) {
      jlogEnd('api-find', globalStart, 'failed', ['Missing query parameter']);

      return NextResponse.json(
        {
          query: '',
          status: 'degraded',
          entity: { legal: '', ticker: '', isin: '', lei: '', country: '' },
          agencies: {},
          diagnostics: {
            tried: [],
            blocked: [],
            elapsed_ms: 0,
            errors: ['Query parameter required (use ?q=<company>)']
          },
          meta: { traceId },
        },
        { status: 200 }
      );
    }

    jlog({
      component: 'api-find',
      query,
      outcome: 'success',
      meta: { event: 'query_received', traceId }
    });

    // Execute finder with 6s budget
    const result = await find(query, 6000);

    const foundCount = Object.keys(result.agencies).length;

    jlogEnd('api-find', globalStart, foundCount > 0 ? 'success' : 'degraded', undefined, {
      found: foundCount,
      elapsed_ms: result.diagnostics.elapsed_ms
    });

    // CRITICAL: ALWAYS return 200
    return NextResponse.json(
      {
        query,
        status: foundCount > 0 ? 'ok' : 'degraded',
        ...result,
        diagnostics: {
          ...result.diagnostics,
          errors: foundCount === 0 ? ['No canonical URLs found'] : []
        },
        meta: { traceId },
      },
      { status: 200 }
    );

  } catch (fatalError: any) {
    // CRITICAL: Even fatal errors return 200 with degraded status
    const totalTime = Date.now() - globalStart;
    jlogEnd('api-find', globalStart, 'failed', [fatalError.message], { fatal: true, total_ms: totalTime });

    return NextResponse.json(
      {
        query: query || '',
        status: 'degraded',
        entity: { legal: '', ticker: '', isin: '', lei: '', country: '' },
        agencies: {},
        diagnostics: {
          tried: [],
          blocked: [],
          elapsed_ms: totalTime,
          errors: [`Fatal error: ${fatalError.message}`],
        },
        meta: { traceId },
      },
      { status: 200 }
    );
  }
}
