/**
 * Moody's Analytics API Adapter
 * Only active if MOODYS_API_KEY is set in ENV
 */

import { AgencyRating, RatingsError, CompanyIdentifiers } from '../types';
import axios from 'axios';

const MOODYS_API_KEY = process.env.MOODYS_API_KEY;
const MOODYS_BASE_URL = process.env.MOODYS_BASE_URL || 'https://api.moodysanalytics.com';

export const isEnabled = !!MOODYS_API_KEY;

/**
 * Fetch Moody's rating from Analytics API
 */
export async function fetchMoodysRating(identifiers: CompanyIdentifiers): Promise<AgencyRating | null> {
  if (!isEnabled) {
    return null;
  }

  const logs: string[] = [];
  logs.push(`[MOODYS_API] Fetching for ${identifiers.name} (${identifiers.ticker || identifiers.isin || 'N/A'})`);

  try {
    // Build query - prefer ISIN > LEI > ticker
    const queryParam = identifiers.isin || identifiers.lei || identifiers.ticker;
    if (!queryParam) {
      logs.push('[MOODYS_API] No valid identifier (ISIN/LEI/ticker)');
      return null;
    }

    // Make API request
    const response = await axios.get(`${MOODYS_BASE_URL}/v1/ratings`, {
      headers: {
        'Authorization': `Bearer ${MOODYS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      params: {
        identifier: queryParam,
        ratingType: 'long-term-issuer',
      },
      timeout: 5000,
    });

    if (!response.data?.rating) {
      logs.push('[MOODYS_API] No rating found in response');
      return null;
    }

    const data = response.data;

    logs.push(`[MOODYS_API] ✅ Found rating: ${data.rating}`);
    console.log(logs.join('\n'));

    return {
      agency: "Moody's",
      rating: data.rating,
      outlook: data.outlook || undefined,
      action: data.action || undefined,
      date: data.date || new Date().toISOString().split('T')[0],
      scale: "Moody's",
      source_ref: data.source_ref || `${MOODYS_BASE_URL}/v1/ratings`,
    };
  } catch (error: any) {
    logs.push(`[MOODYS_API] Error: ${error.message}`);
    console.error(logs.join('\n'));

    if (error.response?.status === 401) {
      throw new RatingsError('AUTH', "Moody's Analytics authentication failed", { error: error.message });
    }
    if (error.response?.status === 429) {
      throw new RatingsError('RATE_LIMIT', "Moody's Analytics rate limit exceeded", { error: error.message });
    }
    if (error.response?.status === 404) {
      return null; // Not found = not rated
    }

    throw new RatingsError('UNKNOWN', `Moody's API error: ${error.message}`, { error: error.message });
  }
}
