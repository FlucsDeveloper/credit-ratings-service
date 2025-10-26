/**
 * Caching Service
 * 6h TTL with stale-while-revalidate pattern
 * Keys by ISIN/LEI (preferred) or ticker
 */

import { RatingsResponse } from './types';

interface CacheEntry {
  data: RatingsResponse;
  timestamp: number;
  stale: boolean;
}

const cache = new Map<string, CacheEntry>();

const TTL = 6 * 60 * 60 * 1000; // 6 hours
const STALE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Generate cache key from query
 */
export function generateCacheKey(query: string, isin?: string, lei?: string, ticker?: string): string {
  // Prefer ISIN > LEI > ticker > query
  if (isin) return `isin:${isin}`;
  if (lei) return `lei:${lei}`;
  if (ticker) return `ticker:${ticker}`;
  return `query:${query.toLowerCase().trim()}`;
}

/**
 * Get cached rating
 */
export function getCached(key: string): { data: RatingsResponse; stale: boolean } | null {
  const entry = cache.get(key);

  if (!entry) return null;

  const age = Date.now() - entry.timestamp;

  // If older than TTL, remove from cache
  if (age > TTL) {
    cache.delete(key);
    return null;
  }

  // If older than stale threshold, mark as stale
  const isStale = age > STALE_THRESHOLD;

  return { data: entry.data, stale: isStale };
}

/**
 * Set cache entry
 */
export function setCached(key: string, data: RatingsResponse): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    stale: false,
  });

  console.log(`[CACHE] Set key: ${key}`);
}

/**
 * Clear cache (for testing)
 */
export function clearCache(): void {
  cache.clear();
  console.log('[CACHE] Cleared all entries');
}

/**
 * Get cache stats
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: cache.size,
    entries: Array.from(cache.keys()),
  };
}
