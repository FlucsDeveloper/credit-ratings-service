import NodeCache from 'node-cache';

// Cache for 7 days (604800 seconds)
const ratingsCache = new NodeCache({
  stdTTL: 604800,
  checkperiod: 3600,
  useClones: false
});

// Cache for company metadata (30 days)
const metadataCache = new NodeCache({
  stdTTL: 2592000,
  checkperiod: 86400,
  useClones: false
});

export interface CachedRating {
  company: string;
  ratings: any;
  summary: any;
  searchedAt: string;
  cached: boolean;
  enrichment?: any;
}

export function getCachedRating(companyName: string): CachedRating | null {
  const key = companyName.toLowerCase().trim();
  const cached = ratingsCache.get<CachedRating>(key);

  if (cached) {
    console.log(`✅ Cache HIT for: ${companyName}`);
    return { ...cached, cached: true };
  }

  console.log(`❌ Cache MISS for: ${companyName}`);
  return null;
}

export function setCachedRating(companyName: string, data: any): void {
  const key = companyName.toLowerCase().trim();
  const cacheData: CachedRating = {
    company: companyName,
    ratings: data.ratings,
    summary: data.summary,
    searchedAt: data.searchedAt,
    cached: false,
    enrichment: data.enrichment,
  };

  ratingsCache.set(key, cacheData);
  console.log(`💾 Cached rating for: ${companyName}`);
}

export function getCacheStats() {
  return {
    ratings: {
      keys: ratingsCache.keys().length,
      hits: ratingsCache.getStats().hits,
      misses: ratingsCache.getStats().misses,
    },
    metadata: {
      keys: metadataCache.keys().length,
      hits: metadataCache.getStats().hits,
      misses: metadataCache.getStats().misses,
    },
  };
}

// Company metadata cache
export function getCachedMetadata(companyName: string) {
  const key = companyName.toLowerCase().trim();
  return metadataCache.get(key);
}

export function setCachedMetadata(companyName: string, data: any): void {
  const key = companyName.toLowerCase().trim();
  metadataCache.set(key, data);
}