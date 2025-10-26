/**
 * Heuristic Fallback Module - POC Mode
 * Uses direct agency website scraping + LLM extraction + public data
 * Leverages existing scrapers and rating extractor
 * FOR POC/TESTING ONLY - Use official vendor APIs for production
 */

import { AgencyRating, CompanyIdentifiers, Outlook } from '../types';

/**
 * Normalize outlook value to match strict Outlook type
 */
function normalizeOutlook(outlook?: string): Outlook | undefined {
  if (!outlook || outlook === 'N/A') {
    return undefined;
  }

  const validOutlooks: Outlook[] = ["Stable", "Positive", "Negative", "Developing", "Watch Positive", "Watch Negative"];
  if (validOutlooks.includes(outlook as Outlook)) {
    return outlook as Outlook;
  }

  return undefined;
}

/**
 * Heuristic S&P rating search using existing scraper + public data fallback
 */
export async function searchSPHeuristic(identifiers: CompanyIdentifiers): Promise<AgencyRating | null> {
  const logs: string[] = [];
  logs.push(`[HEURISTIC_SP] Searching for ${identifiers.name}`);

  try {
    // STEP 1: Try public data first (faster and more reliable)
    const { getPublicCreditRatings } = await import('@/services/publicData');
    const publicData = await getPublicCreditRatings(identifiers.name, identifiers.ticker?.split(' ')[0]);

    if (publicData.sp) {
      logs.push('[HEURISTIC_SP] ✅ Found rating in public database');
      console.log(logs.join('\n'));
      return publicData.sp;
    }

    // STEP 2: Try web scraping + LLM extraction
    const { searchSP } = await import('@/lib/scrapers/agencies');
    const { extractRating } = await import('@/lib/ai/rating-extractor');

    // Try with company name first
    logs.push(`[HEURISTIC_SP] Trying web scraping: ${identifiers.name}`);
    let html = await searchSP(identifiers.name);

    // If no result, try with ticker
    if ((!html || html.length < 500) && identifiers.ticker) {
      logs.push(`[HEURISTIC_SP] Trying with ticker: ${identifiers.ticker}`);
      html = await searchSP(identifiers.ticker);
    }

    if (html && html.length > 500) {
      const result = await extractRating(html, identifiers.name, 'sp');

      if (result.found && result.rating && result.confidence > 0.5) {
        logs.push(`[HEURISTIC_SP] ✅ Found rating: ${result.rating} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
        console.log(logs.join('\n'));

        return {
          agency: 'S&P Global',
          rating: result.rating,
          outlook: normalizeOutlook(result.outlook),
          scale: 'S&P/Fitch',
          source_ref: `https://www.spglobal.com/ratings/ (scraped, confidence: ${(result.confidence * 100).toFixed(0)}%)`,
        };
      }
    }

    logs.push('[HEURISTIC_SP] No rating found');
    console.log(logs.join('\n'));
    return null;
  } catch (error: any) {
    logs.push(`[HEURISTIC_SP] Error: ${error.message}`);
    console.error(logs.join('\n'));
    return null;
  }
}

/**
 * Heuristic Fitch rating search using existing scraper + public data fallback
 */
export async function searchFitchHeuristic(identifiers: CompanyIdentifiers): Promise<AgencyRating | null> {
  const logs: string[] = [];
  logs.push(`[HEURISTIC_FITCH] Searching for ${identifiers.name}`);

  try {
    // STEP 1: Try public data first
    const { getPublicCreditRatings } = await import('@/services/publicData');
    const publicData = await getPublicCreditRatings(identifiers.name, identifiers.ticker?.split(' ')[0]);

    if (publicData.fitch) {
      logs.push('[HEURISTIC_FITCH] ✅ Found rating in public database');
      console.log(logs.join('\n'));
      return publicData.fitch;
    }

    // STEP 2: Try web scraping + LLM extraction
    const { searchFitch } = await import('@/lib/scrapers/agencies');
    const { extractRating } = await import('@/lib/ai/rating-extractor');

    // Try with company name first
    logs.push(`[HEURISTIC_FITCH] Trying web scraping: ${identifiers.name}`);
    let html = await searchFitch(identifiers.name);

    // If no result, try with ticker
    if ((!html || html.length < 500) && identifiers.ticker) {
      logs.push(`[HEURISTIC_FITCH] Trying with ticker: ${identifiers.ticker}`);
      html = await searchFitch(identifiers.ticker);
    }

    if (html && html.length > 500) {
      const result = await extractRating(html, identifiers.name, 'fitch');

      if (result.found && result.rating && result.confidence > 0.5) {
        logs.push(`[HEURISTIC_FITCH] ✅ Found rating: ${result.rating} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
        console.log(logs.join('\n'));

        return {
          agency: 'Fitch',
          rating: result.rating,
          outlook: normalizeOutlook(result.outlook),
          scale: 'S&P/Fitch',
          source_ref: `https://www.fitchratings.com/ (scraped, confidence: ${(result.confidence * 100).toFixed(0)}%)`,
        };
      }
    }

    logs.push('[HEURISTIC_FITCH] No rating found');
    console.log(logs.join('\n'));
    return null;
  } catch (error: any) {
    logs.push(`[HEURISTIC_FITCH] Error: ${error.message}`);
    console.error(logs.join('\n'));
    return null;
  }
}

/**
 * Heuristic Moody's rating search using existing scraper + public data fallback
 */
export async function searchMoodysHeuristic(identifiers: CompanyIdentifiers): Promise<AgencyRating | null> {
  const logs: string[] = [];
  logs.push(`[HEURISTIC_MOODYS] Searching for ${identifiers.name}`);

  try {
    // STEP 1: Try public data first
    const { getPublicCreditRatings } = await import('@/services/publicData');
    const publicData = await getPublicCreditRatings(identifiers.name, identifiers.ticker?.split(' ')[0]);

    if (publicData.moodys) {
      logs.push('[HEURISTIC_MOODYS] ✅ Found rating in public database');
      console.log(logs.join('\n'));
      return publicData.moodys;
    }

    // STEP 2: Try web scraping + LLM extraction
    const { searchMoodys } = await import('@/lib/scrapers/agencies');
    const { extractRating } = await import('@/lib/ai/rating-extractor');

    // Try with company name first
    logs.push(`[HEURISTIC_MOODYS] Trying web scraping: ${identifiers.name}`);
    let html = await searchMoodys(identifiers.name);

    // If no result, try with ticker
    if ((!html || html.length < 500) && identifiers.ticker) {
      logs.push(`[HEURISTIC_MOODYS] Trying with ticker: ${identifiers.ticker}`);
      html = await searchMoodys(identifiers.ticker);
    }

    if (html && html.length > 500) {
      const result = await extractRating(html, identifiers.name, 'moodys');

      if (result.found && result.rating && result.confidence > 0.5) {
        logs.push(`[HEURISTIC_MOODYS] ✅ Found rating: ${result.rating} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
        console.log(logs.join('\n'));

        return {
          agency: "Moody's",
          rating: result.rating,
          outlook: normalizeOutlook(result.outlook),
          scale: "Moody's",
          source_ref: `https://www.moodys.com/ (scraped, confidence: ${(result.confidence * 100).toFixed(0)}%)`,
        };
      }
    }

    logs.push('[HEURISTIC_MOODYS] No rating found');
    console.log(logs.join('\n'));
    return null;
  } catch (error: any) {
    logs.push(`[HEURISTIC_MOODYS] Error: ${error.message}`);
    console.error(logs.join('\n'));
    return null;
  }
}
