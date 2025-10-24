/**
 * Rating Fetchers V2 - Live fetching with retry logic and circuit breakers
 * Fetches ratings from Fitch, S&P, and Moody's for ANY company (not just known DB)
 */

import { AgencyRating, CompanyIdentifiers } from '@/lib/types/ratings';

// Retry configuration
const RETRY_CONFIG = {
  attempts: 3,
  delays: [200, 600, 1200], // Exponential backoff with jitter
  timeout: 15000, // 15 seconds per attempt
};

// Circuit breaker state
const circuitBreakers: Record<string, { failures: number; lastFailure: number; isOpen: boolean }> = {
  fitch: { failures: 0, lastFailure: 0, isOpen: false },
  sp: { failures: 0, lastFailure: 0, isOpen: false },
  moodys: { failures: 0, lastFailure: 0, isOpen: false },
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIME = 60000; // 1 minute

/**
 * Check and update circuit breaker
 */
function checkCircuitBreaker(agency: string): boolean {
  const breaker = circuitBreakers[agency];
  if (!breaker) return false;

  // Reset if enough time has passed
  if (breaker.isOpen && Date.now() - breaker.lastFailure > CIRCUIT_BREAKER_RESET_TIME) {
    breaker.isOpen = false;
    breaker.failures = 0;
    console.log(`[CIRCUIT_BREAKER] ${agency} reset`);
  }

  return breaker.isOpen;
}

function recordFailure(agency: string) {
  const breaker = circuitBreakers[agency];
  if (!breaker) return;

  breaker.failures++;
  breaker.lastFailure = Date.now();

  if (breaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    breaker.isOpen = true;
    console.log(`[CIRCUIT_BREAKER] ${agency} opened after ${breaker.failures} failures`);
  }
}

function recordSuccess(agency: string) {
  const breaker = circuitBreakers[agency];
  if (breaker) {
    breaker.failures = 0;
  }
}

/**
 * Retry wrapper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  agency: string,
  attempt: number = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (attempt < RETRY_CONFIG.attempts - 1) {
      const delay = RETRY_CONFIG.delays[attempt] + Math.random() * 100; // Add jitter
      console.log(`[RETRY] ${agency} attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, agency, attempt + 1);
    }
    throw error;
  }
}

/**
 * Fetch Fitch rating
 */
export async function getFitchRating(
  identifiers: CompanyIdentifiers
): Promise<AgencyRating | { error: string; reason: string }> {
  const logs: string[] = [];
  logs.push(`[FITCH] Fetching for ${identifiers.name} (${identifiers.ticker || identifiers.isin || 'N/A'})`);

  // Check circuit breaker
  if (checkCircuitBreaker('fitch')) {
    logs.push('[FITCH] ⚠️ Circuit breaker is open, skipping');
    console.log(logs.join('\n'));
    return {
      error: 'CIRCUIT_BREAKER_OPEN',
      reason: 'Too many recent failures, temporarily unavailable',
    };
  }

  try {
    const rating = await retryWithBackoff(async () => {
      return await fetchFitchRatingLive(identifiers, logs);
    }, 'fitch');

    if (rating) {
      recordSuccess('fitch');
      logs.push(`[FITCH] ✅ Found rating: ${rating.rating}`);
      console.log(logs.join('\n'));
      return rating;
    }

    logs.push(`[FITCH] ⚠️ Not rated by Fitch`);
    console.log(logs.join('\n'));
    return {
      error: 'NOT_RATED',
      reason: `${identifiers.name} is not rated by Fitch Ratings`,
    };
  } catch (error) {
    recordFailure('fitch');
    logs.push(`[FITCH] ❌ Error: ${error}`);
    console.error(logs.join('\n'));
    return {
      error: 'FETCH_ERROR',
      reason: `Failed to fetch Fitch rating: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetch S&P Global rating
 */
export async function getSPRating(
  identifiers: CompanyIdentifiers
): Promise<AgencyRating | { error: string; reason: string }> {
  const logs: string[] = [];
  logs.push(`[S&P] Fetching for ${identifiers.name} (${identifiers.ticker || identifiers.isin || 'N/A'})`);

  if (checkCircuitBreaker('sp')) {
    logs.push('[S&P] ⚠️ Circuit breaker is open, skipping');
    console.log(logs.join('\n'));
    return {
      error: 'CIRCUIT_BREAKER_OPEN',
      reason: 'Too many recent failures, temporarily unavailable',
    };
  }

  try {
    const rating = await retryWithBackoff(async () => {
      return await fetchSPRatingLive(identifiers, logs);
    }, 'sp');

    if (rating) {
      recordSuccess('sp');
      logs.push(`[S&P] ✅ Found rating: ${rating.rating}`);
      console.log(logs.join('\n'));
      return rating;
    }

    logs.push(`[S&P] ⚠️ Not rated by S&P Global`);
    console.log(logs.join('\n'));
    return {
      error: 'NOT_RATED',
      reason: `${identifiers.name} is not rated by S&P Global`,
    };
  } catch (error) {
    recordFailure('sp');
    logs.push(`[S&P] ❌ Error: ${error}`);
    console.error(logs.join('\n'));
    return {
      error: 'FETCH_ERROR',
      reason: `Failed to fetch S&P rating: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetch Moody's rating
 */
export async function getMoodysRating(
  identifiers: CompanyIdentifiers
): Promise<AgencyRating | { error: string; reason: string }> {
  const logs: string[] = [];
  logs.push(`[MOODY'S] Fetching for ${identifiers.name} (${identifiers.ticker || identifiers.isin || 'N/A'})`);

  if (checkCircuitBreaker('moodys')) {
    logs.push('[MOODY\'S] ⚠️ Circuit breaker is open, skipping');
    console.log(logs.join('\n'));
    return {
      error: 'CIRCUIT_BREAKER_OPEN',
      reason: 'Too many recent failures, temporarily unavailable',
    };
  }

  try {
    const rating = await retryWithBackoff(async () => {
      return await fetchMoodysRatingLive(identifiers, logs);
    }, 'moodys');

    if (rating) {
      recordSuccess('moodys');
      logs.push(`[MOODY'S] ✅ Found rating: ${rating.rating}`);
      console.log(logs.join('\n'));
      return rating;
    }

    logs.push(`[MOODY'S] ⚠️ Not rated by Moody's`);
    console.log(logs.join('\n'));
    return {
      error: 'NOT_RATED',
      reason: `${identifiers.name} is not rated by Moody's`,
    };
  } catch (error) {
    recordFailure('moodys');
    logs.push(`[MOODY'S] ❌ Error: ${error}`);
    console.error(logs.join('\n'));
    return {
      error: 'FETCH_ERROR',
      reason: `Failed to fetch Moody's rating: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Live Fitch rating fetch (using existing scrapers + LLM extraction)
 */
async function fetchFitchRatingLive(identifiers: CompanyIdentifiers, logs: string[]): Promise<AgencyRating | null> {
  try {
    // Use existing scraper infrastructure
    const { searchFitch } = await import('@/lib/scrapers/agencies');
    const { extractRating } = await import('@/lib/ai/rating-extractor');

    // Try multiple search terms
    const searchTerms = [
      identifiers.name,
      identifiers.ticker,
      `${identifiers.name} ${identifiers.country || ''}`.trim(),
    ].filter(Boolean);

    for (const term of searchTerms) {
      logs.push(`[FITCH] Trying: ${term}`);
      const html = await searchFitch(term as string);

      if (html && html.length > 500) {
        const result = await extractRating(html, identifiers.name, 'fitch');
        if (result.found && result.rating && result.confidence > 70) {
          return {
            agency: 'Fitch',
            rating: result.rating,
            outlook: result.outlook || 'N/A',
            date: new Date().toISOString().split('T')[0],
            scale: 'S&P/Fitch',
            source_ref: 'fitchratings.com (scraped)',
          };
        }
      }
    }
  } catch (error) {
    logs.push(`[FITCH] Scraping error: ${error}`);
  }

  return null;
}

/**
 * Live S&P rating fetch
 */
async function fetchSPRatingLive(identifiers: CompanyIdentifiers, logs: string[]): Promise<AgencyRating | null> {
  try {
    const { searchSP } = await import('@/lib/scrapers/agencies');
    const { extractRating } = await import('@/lib/ai/rating-extractor');

    const searchTerms = [
      identifiers.name,
      identifiers.ticker,
      `${identifiers.name} ${identifiers.country || ''}`.trim(),
    ].filter(Boolean);

    for (const term of searchTerms) {
      logs.push(`[S&P] Trying: ${term}`);
      const html = await searchSP(term as string);

      if (html && html.length > 500) {
        const result = await extractRating(html, identifiers.name, 'sp');
        if (result.found && result.rating && result.confidence > 70) {
          return {
            agency: 'S&P Global',
            rating: result.rating,
            outlook: result.outlook || 'N/A',
            date: new Date().toISOString().split('T')[0],
            scale: 'S&P/Fitch',
            source_ref: 'spglobal.com (scraped)',
          };
        }
      }
    }
  } catch (error) {
    logs.push(`[S&P] Scraping error: ${error}`);
  }

  return null;
}

/**
 * Live Moody's rating fetch
 */
async function fetchMoodysRatingLive(identifiers: CompanyIdentifiers, logs: string[]): Promise<AgencyRating | null> {
  try {
    const { searchMoodys } = await import('@/lib/scrapers/agencies');
    const { extractRating } = await import('@/lib/ai/rating-extractor');

    const searchTerms = [
      identifiers.name,
      identifiers.ticker,
      `${identifiers.name} ${identifiers.country || ''}`.trim(),
    ].filter(Boolean);

    for (const term of searchTerms) {
      logs.push(`[MOODY'S] Trying: ${term}`);
      const html = await searchMoodys(term as string);

      if (html && html.length > 500) {
        const result = await extractRating(html, identifiers.name, 'moodys');
        if (result.found && result.rating && result.confidence > 70) {
          return {
            agency: "Moody's",
            rating: result.rating,
            outlook: result.outlook || 'N/A',
            date: new Date().toISOString().split('T')[0],
            scale: "Moody's",
            source_ref: 'moodys.com (scraped)',
          };
        }
      }
    }
  } catch (error) {
    logs.push(`[MOODY'S] Scraping error: ${error}`);
  }

  return null;
}
