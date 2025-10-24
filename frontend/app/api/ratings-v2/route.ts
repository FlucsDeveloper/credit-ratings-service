/**
 * Credit Ratings API v2 - Robust, parallel fetching with proper error handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { RatingsResponse } from '@/lib/types/ratings';
import { resolveCompany } from '@/lib/ratings/entity-resolver';
import { getFitchRating, getSPRating, getMoodysRating } from '@/lib/ratings/fetchers-v2';
import { calculateAverageScore, getRatingCategory } from '@/lib/ratings/normalizer';
import { validatePayload } from '@/lib/ratings/validator';
import { randomUUID } from 'crypto';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Telemetry tracking
const telemetry = {
  totalRequests: 0,
  successfulRequests: 0,
  errors: new Map<string, number>(),
  agencyLatencies: {
    fitch: [] as number[],
    sp: [] as number[],
    moodys: [] as number[],
  },
  agencySuccessRates: {
    fitch: { success: 0, total: 0 },
    sp: { success: 0, total: 0 },
    moodys: { success: 0, total: 0 },
  },
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('company') || searchParams.get('q');

  const traceId = randomUUID();
  const logs: string[] = [];
  const startTime = Date.now();

  telemetry.totalRequests++;

  // Validate input
  if (!query) {
    return NextResponse.json(
      { error: 'Company name, ticker, or ISIN required', traceId },
      { status: 400 }
    );
  }

  logs.push(`[API] Query received: "${query}"`);
  logs.push(`[API] TraceId: ${traceId}`);
  logs.push(`[API] Timestamp: ${new Date().toISOString()}`);

  try {
    // Step 1: Resolve company identifiers
    logs.push('[API] Step 1: Resolving company identifiers...');
    const resolveStartTime = Date.now();

    const identifiers = await resolveCompany(query);

    logs.push(`[API] Resolved to: ${identifiers.name} (${identifiers.ticker || identifiers.isin || identifiers.lei || 'private'}) in ${Date.now() - resolveStartTime}ms`);

    // Check if we have at least one strong identifier
    if (!identifiers.ticker && !identifiers.isin && !identifiers.lei) {
      logs.push('[API] ⚠️ Warning: No strong identifier (ticker/ISIN/LEI) found, results may be unreliable');
    }

    // Step 2: Fetch ratings in parallel with timeout and telemetry
    logs.push('[API] Step 2: Fetching ratings from agencies (parallel)...');

    const fetchWithTimeout = <T>(
      promise: Promise<T>,
      timeoutMs: number,
      agency: string
    ): Promise<T | { error: string; reason: string }> => {
      return Promise.race([
        promise,
        new Promise<{ error: string; reason: string }>((resolve) =>
          setTimeout(
            () => resolve({ error: 'TIMEOUT', reason: `${agency} request timed out after ${timeoutMs}ms` }),
            timeoutMs
          )
        ),
      ]);
    };

    // Track timing for each agency
    const fitchStartTime = Date.now();
    const spStartTime = Date.now();
    const moodysStartTime = Date.now();

    const [fitchResult, spResult, moodysResult] = await Promise.all([
      fetchWithTimeout(getFitchRating(identifiers), 20000, 'Fitch').then(result => {
        const latency = Date.now() - fitchStartTime;
        telemetry.agencyLatencies.fitch.push(latency);
        telemetry.agencySuccessRates.fitch.total++;
        if (result && 'rating' in result) {
          telemetry.agencySuccessRates.fitch.success++;
        }
        logs.push(`[API] Fitch completed in ${latency}ms`);
        return result;
      }),
      fetchWithTimeout(getSPRating(identifiers), 20000, 'S&P').then(result => {
        const latency = Date.now() - spStartTime;
        telemetry.agencyLatencies.sp.push(latency);
        telemetry.agencySuccessRates.sp.total++;
        if (result && 'rating' in result) {
          telemetry.agencySuccessRates.sp.success++;
        }
        logs.push(`[API] S&P completed in ${latency}ms`);
        return result;
      }),
      fetchWithTimeout(getMoodysRating(identifiers), 20000, "Moody's").then(result => {
        const latency = Date.now() - moodysStartTime;
        telemetry.agencyLatencies.moodys.push(latency);
        telemetry.agencySuccessRates.moodys.total++;
        if (result && 'rating' in result) {
          telemetry.agencySuccessRates.moodys.success++;
        }
        logs.push(`[API] Moody's completed in ${latency}ms`);
        return result;
      }),
    ]);

    // Step 3: Process results
    logs.push('[API] Step 3: Processing results...');

    let agenciesFound = 0;
    if (fitchResult && 'rating' in fitchResult) {
      agenciesFound++;
      logs.push(`[API] ✅ Fitch: ${fitchResult.rating} (${fitchResult.outlook})`);
    } else {
      logs.push(`[API] ⚠️ Fitch: ${fitchResult?.reason || 'No data'}`);
    }

    if (spResult && 'rating' in spResult) {
      agenciesFound++;
      logs.push(`[API] ✅ S&P: ${spResult.rating} (${spResult.outlook})`);
    } else {
      logs.push(`[API] ⚠️ S&P: ${spResult?.reason || 'No data'}`);
    }

    if (moodysResult && 'rating' in moodysResult) {
      agenciesFound++;
      logs.push(`[API] ✅ Moody's: ${moodysResult.rating} (${moodysResult.outlook})`);
    } else {
      logs.push(`[API] ⚠️ Moody's: ${moodysResult?.reason || 'No data'}`);
    }

    // Step 4: Calculate summary
    const averageScore = calculateAverageScore({
      fitch: fitchResult,
      sp: spResult,
      moodys: moodysResult,
    });

    const category = getRatingCategory(averageScore);

    // Step 5: Build response
    const processingTime = Date.now() - startTime;
    logs.push(`[API] Processing completed in ${processingTime}ms`);
    logs.push(`[API] Agencies found: ${agenciesFound}/3`);
    if (averageScore) {
      logs.push(`[API] Average score: ${averageScore}`);
      logs.push(`[API] Category: ${category}`);
    }

    // Build payload for validation
    const payload = {
      entity: identifiers,
      ratings: {
        fitch: fitchResult,
        sp: spResult,
        moodys: moodysResult,
      },
      summary: {
        agenciesFound,
        averageScore,
        category,
      },
    };

    // Step 6: Validate payload before sending to frontend
    logs.push('[API] Step 6: Validating payload...');
    try {
      validatePayload(payload);
      logs.push('[API] ✅ Payload validation passed');
    } catch (validationError: any) {
      logs.push(`[API] ❌ Payload validation failed: ${validationError.message}`);
      console.error('Validation errors:', validationError.errors || validationError);

      // Log detailed validation errors
      if (validationError.errors) {
        validationError.errors.forEach((err: any) => {
          logs.push(`[API]   - ${err.code}: ${err.message}`);
        });
      }

      // Return 422 with validation details
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_FAILED',
          message: 'Rating data failed validation checks',
          details: validationError.errors || [],
          traceId,
          logs,
        },
        { status: 422 }
      );
    }

    const response: RatingsResponse = {
      success: true,
      company: identifiers.name,
      identifiers,
      ratings: {
        fitch: fitchResult,
        sp: spResult,
        moodys: moodysResult,
      },
      summary: {
        agenciesFound,
        averageScore,
        category,
        lastUpdated: new Date().toISOString(),
      },
      logs,
    };

    // Log summary to console
    console.log('\n' + '='.repeat(80));
    console.log(`CREDIT RATINGS QUERY: ${query}`);
    console.log(`TraceId: ${traceId}`);
    console.log(`Company: ${identifiers.name}`);
    console.log(`Identifiers: ticker=${identifiers.ticker}, ISIN=${identifiers.isin}, LEI=${identifiers.lei}`);
    console.log(`Agencies found: ${agenciesFound}/3`);
    if (averageScore) {
      console.log(`Average score: ${averageScore}`);
      console.log(`Category: ${category}`);
    }
    console.log(`Processing time: ${processingTime}ms`);
    console.log('='.repeat(80) + '\n');

    telemetry.successfulRequests++;

    return NextResponse.json({
      ...response,
      meta: {
        traceId,
        lastUpdated: new Date().toISOString(),
        sourcePriority: ['live', 'cache'],
        processingTimeMs: processingTime,
      },
    });
  } catch (error) {
    logs.push(`[API] ❌ Fatal error: ${error}`);
    console.error('API Error:', error);

    // Track error
    const errorCode = (error as any)?.code || 'UNKNOWN_ERROR';
    telemetry.errors.set(errorCode, (telemetry.errors.get(errorCode) || 0) + 1);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        code: errorCode,
        traceId,
        logs,
      },
      { status: 502 }
    );
  }
}

/**
 * Telemetry endpoint
 */
export async function OPTIONS(request: NextRequest) {
  const avgLatency = (agency: 'fitch' | 'sp' | 'moodys') => {
    const latencies = telemetry.agencyLatencies[agency];
    if (latencies.length === 0) return 0;
    return Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  };

  const successRate = (agency: 'fitch' | 'sp' | 'moodys') => {
    const rates = telemetry.agencySuccessRates[agency];
    if (rates.total === 0) return 0;
    return Math.round((rates.success / rates.total) * 100);
  };

  const metrics = {
    totalRequests: telemetry.totalRequests,
    successfulRequests: telemetry.successfulRequests,
    successRate: telemetry.totalRequests > 0
      ? Math.round((telemetry.successfulRequests / telemetry.totalRequests) * 100)
      : 0,
    agencies: {
      fitch: {
        avgLatencyMs: avgLatency('fitch'),
        successRate: successRate('fitch'),
        totalRequests: telemetry.agencySuccessRates.fitch.total,
        successfulRequests: telemetry.agencySuccessRates.fitch.success,
      },
      sp: {
        avgLatencyMs: avgLatency('sp'),
        successRate: successRate('sp'),
        totalRequests: telemetry.agencySuccessRates.sp.total,
        successfulRequests: telemetry.agencySuccessRates.sp.success,
      },
      moodys: {
        avgLatencyMs: avgLatency('moodys'),
        successRate: successRate('moodys'),
        totalRequests: telemetry.agencySuccessRates.moodys.total,
        successfulRequests: telemetry.agencySuccessRates.moodys.success,
      },
    },
    errors: Object.fromEntries(telemetry.errors),
  };

  return NextResponse.json(metrics);
}