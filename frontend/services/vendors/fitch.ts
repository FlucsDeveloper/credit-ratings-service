/**
 * Fitch Solutions API Adapter
 * Only active if FITCH_API_KEY is set in ENV
 */

import { AgencyRating, RatingsError, CompanyIdentifiers } from '../types';
import axios from 'axios';

const FITCH_API_KEY = process.env.FITCH_API_KEY;
const FITCH_BASE_URL = process.env.FITCH_BASE_URL || 'https://api.fitchsolutions.com';

export const isEnabled = !!FITCH_API_KEY;

/**
 * Fetch Fitch rating from Solutions API
 */
export async function fetchFitchRating(identifiers: CompanyIdentifiers): Promise<AgencyRating | null> {
  if (!isEnabled) {
    return null;
  }

  const logs: string[] = [];
  logs.push(`[FITCH_API] Fetching for ${identifiers.name} (${identifiers.ticker || identifiers.isin || 'N/A'})`);

  try {
    // Build query - prefer ISIN > LEI > ticker
    const queryParam = identifiers.isin || identifiers.lei || identifiers.ticker;
    if (!queryParam) {
      logs.push('[FITCH_API] No valid identifier (ISIN/LEI/ticker)');
      return null;
    }

    // Make API request
    const response = await axios.get(`${FITCH_BASE_URL}/v1/ratings`, {
      headers: {
        'Authorization': `Bearer ${FITCH_API_KEY}`,
        'Content-Type': 'application/json',
      },
      params: {
        identifier: queryParam,
        ratingType: 'long-term-issuer',
      },
      timeout: 5000,
    });

    if (!response.data?.rating) {
      logs.push('[FITCH_API] No rating found in response');
      return null;
    }

    const data = response.data;

    logs.push(`[FITCH_API] ✅ Found rating: ${data.rating}`);
    console.log(logs.join('\n'));

    return {
      agency: 'Fitch',
      rating: data.rating,
      outlook: data.outlook || undefined,
      action: data.action || undefined,
      date: data.date || new Date().toISOString().split('T')[0],
      scale: 'S&P/Fitch',
      source_ref: data.source_ref || `${FITCH_BASE_URL}/v1/ratings`,
    };
  } catch (error: any) {
    logs.push(`[FITCH_API] Error: ${error.message}`);
    console.error(logs.join('\n'));

    if (error.response?.status === 401) {
      throw new RatingsError('AUTH', 'Fitch Solutions authentication failed', { error: error.message });
    }
    if (error.response?.status === 429) {
      throw new RatingsError('RATE_LIMIT', 'Fitch Solutions rate limit exceeded', { error: error.message });
    }
    if (error.response?.status === 404) {
      return null; // Not found = not rated
    }

    throw new RatingsError('UNKNOWN', `Fitch API error: ${error.message}`, { error: error.message });
  }
}
