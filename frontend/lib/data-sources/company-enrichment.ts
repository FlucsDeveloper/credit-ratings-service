import { getYahooFinanceData, guessTicker } from './yahoo-finance';
import { getWikipediaData } from './wikipedia';
import { getCachedMetadata, setCachedMetadata } from '../cache/memory-cache';

interface EnrichedCompanyData {
  companyName: string;
  ticker?: string;
  isin?: string;
  industry?: string;
  sector?: string;
  country?: string;
  headquarters?: string;
  founded?: string;
  website?: string;
  employees?: number;
  marketCap?: number;
  revenue?: number;
  debtToEquity?: number;
  description?: string;
  type?: string;
  dataQuality: 'high' | 'medium' | 'low';
  sources: string[];
}

export async function enrichCompanyData(
  companyName: string,
  knownTicker?: string
): Promise<EnrichedCompanyData> {
  console.log(`[ENRICHMENT] Starting for: ${companyName}`);

  // Check cache first
  const cached = getCachedMetadata(companyName);
  if (cached) {
    console.log(`[ENRICHMENT] ✅ Cache hit for ${companyName}`);
    return cached as EnrichedCompanyData;
  }

  const sources: string[] = [];
  const enrichedData: EnrichedCompanyData = {
    companyName,
    dataQuality: 'low',
    sources,
  };

  try {
    // 1. Try to get ticker
    let ticker = knownTicker;
    if (!ticker) {
      ticker = await guessTicker(companyName) || undefined;
      console.log(`[ENRICHMENT] Guessed ticker: ${ticker}`);
    }

    // 2. Fetch from multiple sources in parallel
    const [yahooData, wikiData] = await Promise.all([
      ticker ? getYahooFinanceData(ticker) : Promise.resolve({ found: false }),
      getWikipediaData(companyName),
    ]);

    // 3. Merge Yahoo Finance data
    if (yahooData.found) {
      sources.push('Yahoo Finance');
      const data = yahooData as any;
      enrichedData.companyName = data.companyName || companyName;
      enrichedData.ticker = ticker;
      enrichedData.industry = data.industry;
      enrichedData.sector = data.sector;
      enrichedData.country = data.country;
      enrichedData.website = data.website;
      enrichedData.employees = data.employees;
      enrichedData.marketCap = data.marketCap;
      enrichedData.revenue = data.revenue;
      enrichedData.debtToEquity = data.debtToEquity;
      enrichedData.description = data.description;
    }

    // 4. Merge Wikipedia data
    if (wikiData.found) {
      sources.push('Wikipedia');
      const wiki = wikiData as any;

      // Prefer Wikipedia for certain fields
      enrichedData.ticker = enrichedData.ticker || wiki.ticker;
      enrichedData.isin = wiki.isin;
      enrichedData.founded = wiki.founded;
      enrichedData.headquarters = wiki.headquarters || enrichedData.headquarters;
      enrichedData.type = wiki.type;

      // Fill gaps with Wikipedia data
      enrichedData.industry = enrichedData.industry || wiki.industry;
      enrichedData.revenue = enrichedData.revenue || parseRevenue(wiki.revenue);
    }

    // 5. Determine data quality
    if (sources.length >= 2) {
      enrichedData.dataQuality = 'high';
    } else if (sources.length === 1) {
      enrichedData.dataQuality = 'medium';
    }

    // 6. Cache the enriched data
    if (sources.length > 0) {
      setCachedMetadata(companyName, enrichedData);
      console.log(`[ENRICHMENT] ✅ Cached data for ${companyName} from ${sources.join(', ')}`);
    } else {
      console.log(`[ENRICHMENT] ⚠️ No enrichment data found for ${companyName}`);
    }

  } catch (error) {
    console.error(`[ENRICHMENT] ❌ Error enriching ${companyName}:`, error);
  }

  return enrichedData;
}

function parseRevenue(revenue?: string): number | undefined {
  if (!revenue) return undefined;

  // Extract number from strings like "$100 billion", "€50M", etc.
  const match = revenue.match(/[\d.]+/);
  if (!match) return undefined;

  let value = parseFloat(match[0]);

  // Convert to raw value based on suffix
  if (revenue.toLowerCase().includes('trillion')) {
    value *= 1_000_000_000_000;
  } else if (revenue.toLowerCase().includes('billion')) {
    value *= 1_000_000_000;
  } else if (revenue.toLowerCase().includes('million')) {
    value *= 1_000_000;
  }

  return value;
}

// Batch enrichment for multiple companies
export async function enrichMultipleCompanies(
  companies: Array<{ name: string; ticker?: string }>
): Promise<EnrichedCompanyData[]> {
  console.log(`[ENRICHMENT] Batch processing ${companies.length} companies`);

  const results = await Promise.allSettled(
    companies.map(c => enrichCompanyData(c.name, c.ticker))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`[ENRICHMENT] Failed for ${companies[index].name}:`, result.reason);
      return {
        companyName: companies[index].name,
        dataQuality: 'low' as const,
        sources: [],
      };
    }
  });
}