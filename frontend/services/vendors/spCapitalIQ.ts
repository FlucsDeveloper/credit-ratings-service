/**
 * S&P Capital IQ API Adapter
 * Only active if SP_API_KEY is set in ENV
 */

import { AgencyRating, RatingsError, CompanyIdentifiers } from '../types';
import axios from 'axios';

const SP_API_KEY = process.env.SP_API_KEY;
const SP_BASE_URL = process.env.SP_BASE_URL || 'https://api.capitaliq.com';

export const isEnabled = !!SP_API_KEY;

/**
 * Fetch S&P rating from Capital IQ API
 */
export async function fetchSPRating(identifiers: CompanyIdentifiers): Promise<AgencyRating | null> {
  if (!isEnabled) {
    return null;
  }

  const logs: string[] = [];
  logs.push(`[S&P_API] Fetching for ${identifiers.name} (${identifiers.ticker || identifiers.isin || 'N/A'})`);

  try {
    // Build query - prefer ISIN > LEI > ticker
    const queryParam = identifiers.isin || identifiers.lei || identifiers.ticker;
    if (!queryParam) {
      logs.push('[S&P_API] No valid identifier (ISIN/LEI/ticker)');
      return null;
    }

    // Make API request
    const response = await axios.get(`${SP_BASE_URL}/v1/ratings`, {
      headers: {
        'Authorization': `Bearer ${SP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      params: {
        identifier: queryParam,
        ratingType: 'long-term-issuer',
      },
      timeout: 5000,
    });

    if (!response.data?.rating) {
      logs.push('[S&P_API] No rating found in response');
      return null;
    }

    const data = response.data;

    logs.push(`[S&P_API] ✅ Found rating: ${data.rating}`);
    console.log(logs.join('\n'));

    return {
      agency: 'S&P Global',
      rating: data.rating,
      outlook: data.outlook || undefined,
      action: data.action || undefined,
      date: data.date || new Date().toISOString().split('T')[0],
      scale: 'S&P/Fitch',
      source_ref: data.source_ref || `${SP_BASE_URL}/v1/ratings`,
    };
  } catch (error: any) {
    logs.push(`[S&P_API] Error: ${error.message}`);
    console.error(logs.join('\n'));

    if (error.response?.status === 401) {
      throw new RatingsError('AUTH', 'S&P Capital IQ authentication failed', { error: error.message });
    }
    if (error.response?.status === 429) {
      throw new RatingsError('RATE_LIMIT', 'S&P Capital IQ rate limit exceeded', { error: error.message });
    }
    if (error.response?.status === 404) {
      return null; // Not found = not rated
    }

    throw new RatingsError('UNKNOWN', `S&P API error: ${error.message}`, { error: error.message });
  }
}
