/**
 * Entity Resolver - Maps company names/tickers/ISINs/LEIs to canonical identifiers
 * Resolution priority: ISIN → LEI → CIK/ticker → legal_name → aliases (LLM fallback)
 */

import { CompanyIdentifiers } from '@/lib/types/ratings';
import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const CompanySchema = z.object({
  officialName: z.string(),
  ticker: z.string().optional(),
  isin: z.string().optional(),
  lei: z.string().optional(),
  cusip: z.string().optional(),
  cik: z.string().optional(),
  country: z.string().optional(),
  sector: z.string().optional(),
  entityType: z.enum(['corporate', 'sovereign', 'financial', 'subsidiary', 'municipality']).optional(),
  parentCompany: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

interface ResolutionLog {
  step: string;
  success: boolean;
  details: string;
  identifiers?: CompanyIdentifiers;
}

/**
 * Resolve company query to canonical identifiers
 * Priority: ISIN → LEI → CIK/ticker(+exchange) → legal_name → aliases
 */
export async function resolveCompany(query: string): Promise<CompanyIdentifiers & { resolutionLogs?: ResolutionLog[] }> {
  const logs: ResolutionLog[] = [];

  console.log(`[RESOLVER] Starting resolution for: "${query}"`);

  // Detect query type
  const queryType = detectQueryType(query);
  logs.push({ step: 'DETECT_TYPE', success: true, details: `Detected: ${queryType}` });

  // Step 1: ISIN lookup
  if (queryType === 'ISIN' || queryType === 'UNKNOWN') {
    const isinResult = await resolveByISIN(query);
    if (isinResult) {
      logs.push({ step: 'ISIN_LOOKUP', success: true, details: `Found via ISIN`, identifiers: isinResult });
      return { ...isinResult, resolutionLogs: logs };
    }
    logs.push({ step: 'ISIN_LOOKUP', success: false, details: 'No match found' });
  }

  // Step 2: LEI lookup
  if (queryType === 'LEI' || queryType === 'UNKNOWN') {
    const leiResult = await resolveByLEI(query);
    if (leiResult) {
      logs.push({ step: 'LEI_LOOKUP', success: true, details: `Found via LEI`, identifiers: leiResult });
      return { ...leiResult, resolutionLogs: logs };
    }
    logs.push({ step: 'LEI_LOOKUP', success: false, details: 'No match found' });
  }

  // Step 3: CIK/Ticker lookup
  if (queryType === 'TICKER' || queryType === 'CIK' || queryType === 'UNKNOWN') {
    const tickerResult = await resolveByTickerOrCIK(query);
    if (tickerResult) {
      logs.push({ step: 'TICKER_CIK_LOOKUP', success: true, details: `Found via ticker/CIK`, identifiers: tickerResult });
      return { ...tickerResult, resolutionLogs: logs };
    }
    logs.push({ step: 'TICKER_CIK_LOOKUP', success: false, details: 'No match found' });
  }

  // Step 4: Company name search (Financial APIs)
  if (queryType === 'COMPANY_NAME' || queryType === 'UNKNOWN') {
    const nameResult = await resolveByCompanyName(query);
    if (nameResult) {
      logs.push({ step: 'COMPANY_NAME_LOOKUP', success: true, details: `Found via company name search`, identifiers: nameResult });
      return { ...nameResult, resolutionLogs: logs };
    }
    logs.push({ step: 'COMPANY_NAME_LOOKUP', success: false, details: 'No match found' });
  }

  // Step 5: LLM fallback with aliases
  console.log('[RESOLVER] Using LLM fallback for entity resolution');
  logs.push({ step: 'LLM_FALLBACK', success: false, details: 'Attempting LLM resolution...' });

  try {
    const { object } = await generateObject({
      model: google('gemini-2.0-flash-exp'),
      schema: CompanySchema,
      prompt: `Identify this company/entity and provide all official identifiers.

Query: "${query}"

Instructions:
- Identify the exact legal entity name
- If it's an ISIN (e.g., US0378331005), identify the issuer
- If it's a LEI (e.g., 5493006KIKJX8S7WZV61), identify the entity
- If it's a ticker (2-5 letters), provide the company name AND exchange (e.g., AAPL on NASDAQ)
- If it's a subsidiary, identify the parent company
- For sovereign entities (countries), use format: "Government of [Country]"
- For banks/financial institutions, specify the full legal name
- Provide ISIN, LEI, CIK, ticker (with exchange if ambiguous), CUSIP when available
- Include common aliases and local language names
- Specify entity type: corporate, sovereign, financial, subsidiary, or municipality

Return comprehensive identifiers.`,
    });

    const identifiers: CompanyIdentifiers = {
      name: object.officialName,
      ticker: object.ticker,
      isin: object.isin,
      lei: object.lei,
      cusip: object.cusip,
      aliases: object.aliases,
      entityType: object.entityType,
      parentCompany: object.parentCompany,
      country: object.country,
    };

    logs.push({
      step: 'LLM_FALLBACK',
      success: true,
      details: `LLM resolved to: ${identifiers.name}${identifiers.parentCompany ? ` (parent: ${identifiers.parentCompany})` : ''}`,
      identifiers
    });

    console.log(`[RESOLVER] ✅ LLM resolved to: ${identifiers.name} (${identifiers.ticker || 'private'})`);
    return { ...identifiers, resolutionLogs: logs };

  } catch (error) {
    console.error('[RESOLVER] ❌ LLM resolution failed:', error);
    logs.push({ step: 'LLM_FALLBACK', success: false, details: `LLM error: ${error}` });

    // Final fallback
    const fallbackIdentifiers: CompanyIdentifiers = {
      name: query,
      aliases: [query],
    };

    if (queryType === 'TICKER') {
      fallbackIdentifiers.ticker = query.toUpperCase();
    }

    logs.push({ step: 'FINAL_FALLBACK', success: true, details: 'Using query as-is', identifiers: fallbackIdentifiers });
    return { ...fallbackIdentifiers, resolutionLogs: logs };
  }
}

/**
 * Detect query type
 */
function detectQueryType(query: string): 'ISIN' | 'LEI' | 'CUSIP' | 'CIK' | 'TICKER' | 'COMPANY_NAME' | 'UNKNOWN' {
  const trimmed = query.trim();

  // ISIN: 2 letters + 10 alphanumeric (e.g., US0378331005)
  if (/^[A-Z]{2}[A-Z0-9]{10}$/i.test(trimmed)) {
    return 'ISIN';
  }

  // LEI: 20 alphanumeric (e.g., 5493006KIKJX8S7WZV61)
  if (/^[A-Z0-9]{20}$/i.test(trimmed)) {
    return 'LEI';
  }

  // CUSIP: 9 alphanumeric
  if (/^[A-Z0-9]{9}$/i.test(trimmed)) {
    return 'CUSIP';
  }

  // CIK: 10 digits (e.g., 0000320193)
  if (/^\d{10}$/.test(trimmed)) {
    return 'CIK';
  }

  // Ticker: 1-5 uppercase letters, possibly with exchange suffix (e.g., AAPL, ITUB4.BVMF)
  if (/^[A-Z]{1,5}(\.[A-Z]+)?$/i.test(trimmed)) {
    return 'TICKER';
  }

  // Otherwise, assume company name
  if (trimmed.length > 5) {
    return 'COMPANY_NAME';
  }

  return 'UNKNOWN';
}

/**
 * Resolve by ISIN
 */
async function resolveByISIN(query: string): Promise<CompanyIdentifiers | null> {
  const isin = query.trim().toUpperCase();

  // Check OpenFIGI API
  if (process.env.OPENFIGI_API_KEY) {
    try {
      const response = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OPENFIGI-APIKEY': process.env.OPENFIGI_API_KEY,
        },
        body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
      });

      const data = await response.json();
      if (data && data[0]?.data && data[0].data.length > 0) {
        const result = data[0].data[0];
        return {
          name: result.name,
          ticker: result.ticker,
          isin: isin,
          exchCode: result.exchCode,
        };
      }
    } catch (error) {
      console.log('[RESOLVER] OpenFIGI ISIN lookup failed:', error);
    }
  }

  return null;
}

/**
 * Resolve by LEI
 */
async function resolveByLEI(query: string): Promise<CompanyIdentifiers | null> {
  const lei = query.trim().toUpperCase();

  try {
    // Use GLEIF API (free, no key required)
    const response = await fetch(`https://api.gleif.org/api/v1/lei-records/${lei}`);
    if (response.ok) {
      const data = await response.json();
      const entity = data.data?.attributes?.entity;
      if (entity) {
        return {
          name: entity.legalName?.name || entity.transliteratedOtherEntityNames?.[0]?.name,
          lei: lei,
          country: entity.legalAddress?.country,
          aliases: entity.transliteratedOtherEntityNames?.map((n: any) => n.name),
        };
      }
    }
  } catch (error) {
    console.log('[RESOLVER] GLEIF LEI lookup failed:', error);
  }

  return null;
}

/**
 * Resolve by Ticker or CIK
 */
async function resolveByTickerOrCIK(query: string): Promise<CompanyIdentifiers | null> {
  const ticker = query.trim().toUpperCase();

  // Try Financial Modeling Prep
  if (process.env.FINANCIAL_MODELING_PREP_API_KEY) {
    try {
      const endpoint = `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${process.env.FINANCIAL_MODELING_PREP_API_KEY}`;
      const response = await fetch(endpoint);
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        const company = data[0];
        return {
          name: company.companyName,
          ticker: company.symbol,
          isin: company.isin,
          cusip: company.cusip,
          cik: company.cik,
          country: company.country,
          exchange: company.exchangeShortName,
        };
      }
    } catch (error) {
      console.log('[RESOLVER] FMP lookup failed:', error);
    }
  }

  // Try Alpha Vantage
  if (process.env.ALPHA_VANTAGE_API_KEY) {
    try {
      const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.Name) {
        return {
          name: data.Name,
          ticker: data.Symbol,
          isin: data.ISIN,
          cusip: data.CUSIP,
          country: data.Country,
          sector: data.Sector,
        };
      }
    } catch (error) {
      console.log('[RESOLVER] Alpha Vantage lookup failed:', error);
    }
  }

  return null;
}

/**
 * Resolve by company name
 */
async function resolveByCompanyName(query: string): Promise<CompanyIdentifiers | null> {
  // Try Financial Modeling Prep search
  if (process.env.FINANCIAL_MODELING_PREP_API_KEY) {
    try {
      const endpoint = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query)}&limit=1&apikey=${process.env.FINANCIAL_MODELING_PREP_API_KEY}`;
      const response = await fetch(endpoint);
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        const company = data[0];
        return {
          name: company.name,
          ticker: company.symbol,
          exchange: company.exchangeShortName,
          country: company.currency === 'USD' ? 'US' : undefined,
        };
      }
    } catch (error) {
      console.log('[RESOLVER] FMP name search failed:', error);
    }
  }

  return null;
}
