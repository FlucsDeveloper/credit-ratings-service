/**
 * Entity Resolution Service
 * Priority: ISIN → LEI → ticker(+exchange) → legal_name → aliases
 * Uses LLM only as fallback suggestion; revalidates via lookups
 */

import { CompanyIdentifiers, RatingsError } from './types';
import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import axios from 'axios';

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
}

/**
 * Detect query type
 */
function detectQueryType(query: string): 'ISIN' | 'LEI' | 'CUSIP' | 'CIK' | 'TICKER' | 'COMPANY_NAME' | 'UNKNOWN' {
  const trimmed = query.trim();

  // ISIN: 2 letters + 10 alphanumeric (e.g., US0378331005)
  if (/^[A-Z]{2}[A-Z0-9]{10}$/i.test(trimmed)) return 'ISIN';

  // LEI: 20 alphanumeric (e.g., 5493006KIKJX8S7WZV61)
  if (/^[A-Z0-9]{20}$/i.test(trimmed)) return 'LEI';

  // CUSIP: 9 alphanumeric
  if (/^[A-Z0-9]{9}$/i.test(trimmed)) return 'CUSIP';

  // CIK: 10 digits (e.g., 0000320193)
  if (/^\d{10}$/.test(trimmed)) return 'CIK';

  // Ticker: 1-5 uppercase letters, possibly with exchange suffix (e.g., AAPL, PBR.NYSE)
  if (/^[A-Z]{1,5}(\.[A-Z]+)?$/i.test(trimmed)) return 'TICKER';

  // Otherwise, assume company name
  if (trimmed.length > 5) return 'COMPANY_NAME';

  return 'UNKNOWN';
}

/**
 * Resolve by ISIN using OpenFIGI
 */
async function resolveByISIN(query: string): Promise<CompanyIdentifiers | null> {
  const isin = query.trim().toUpperCase();

  if (process.env.OPENFIGI_API_KEY) {
    try {
      const response = await axios.post(
        'https://api.openfigi.com/v3/mapping',
        [{ idType: 'ID_ISIN', idValue: isin }],
        {
          headers: {
            'Content-Type': 'application/json',
            'X-OPENFIGI-APIKEY': process.env.OPENFIGI_API_KEY,
          },
          timeout: 5000,
        }
      );

      if (response.data?.[0]?.data?.[0]) {
        const result = response.data[0].data[0];
        return {
          name: result.name,
          ticker: result.ticker,
          isin: isin,
          exchange: result.exchCode,
        };
      }
    } catch (error: any) {
      console.log('[RESOLVER] OpenFIGI ISIN lookup failed:', error.message);
    }
  }

  return null;
}

/**
 * Resolve by LEI using GLEIF
 */
async function resolveByLEI(query: string): Promise<CompanyIdentifiers | null> {
  const lei = query.trim().toUpperCase();

  try {
    const response = await axios.get(`https://api.gleif.org/api/v1/lei-records/${lei}`, {
      timeout: 5000,
    });

    if (response.status === 200) {
      const entity = response.data.data?.attributes?.entity;
      if (entity) {
        return {
          name: entity.legalName?.name || entity.transliteratedOtherEntityNames?.[0]?.name,
          lei: lei,
          country: entity.legalAddress?.country,
          aliases: entity.transliteratedOtherEntityNames?.map((n: any) => n.name),
        };
      }
    }
  } catch (error: any) {
    console.log('[RESOLVER] GLEIF LEI lookup failed:', error.message);
  }

  return null;
}

/**
 * Resolve by Ticker or CIK using Financial Modeling Prep
 */
async function resolveByTickerOrCIK(query: string): Promise<CompanyIdentifiers | null> {
  const ticker = query.trim().toUpperCase();

  if (process.env.FINANCIAL_MODELING_PREP_API_KEY) {
    try {
      const endpoint = `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${process.env.FINANCIAL_MODELING_PREP_API_KEY}`;
      const response = await axios.get(endpoint, { timeout: 5000 });

      if (Array.isArray(response.data) && response.data.length > 0) {
        const company = response.data[0];
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
    } catch (error: any) {
      console.log('[RESOLVER] FMP lookup failed:', error.message);
    }
  }

  // Try Alpha Vantage
  if (process.env.ALPHA_VANTAGE_API_KEY) {
    try {
      const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
      const response = await axios.get(url, { timeout: 5000 });

      if (response.data.Name) {
        return {
          name: response.data.Name,
          ticker: response.data.Symbol,
          isin: response.data.ISIN,
          cusip: response.data.CUSIP,
          country: response.data.Country,
          sector: response.data.Sector,
        };
      }
    } catch (error: any) {
      console.log('[RESOLVER] Alpha Vantage lookup failed:', error.message);
    }
  }

  return null;
}

/**
 * Resolve by company name using FMP search
 */
async function resolveByCompanyName(query: string): Promise<CompanyIdentifiers | null> {
  if (process.env.FINANCIAL_MODELING_PREP_API_KEY) {
    try {
      const endpoint = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query)}&limit=1&apikey=${process.env.FINANCIAL_MODELING_PREP_API_KEY}`;
      const response = await axios.get(endpoint, { timeout: 5000 });

      if (Array.isArray(response.data) && response.data.length > 0) {
        const company = response.data[0];
        return {
          name: company.name,
          ticker: company.symbol,
          exchange: company.exchangeShortName,
          country: company.currency === 'USD' ? 'US' : undefined,
        };
      }
    } catch (error: any) {
      console.log('[RESOLVER] FMP name search failed:', error.message);
    }
  }

  return null;
}

/**
 * LLM fallback for entity resolution
 */
async function resolveLLMFallback(query: string): Promise<CompanyIdentifiers | null> {
  try {
    console.log('[RESOLVER] Using LLM fallback for entity resolution');

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

    return {
      name: object.officialName,
      ticker: object.ticker,
      isin: object.isin,
      lei: object.lei,
      cusip: object.cusip,
      country: object.country,
      entityType: object.entityType,
      parentCompany: object.parentCompany,
      aliases: object.aliases,
    };
  } catch (error: any) {
    console.error('[RESOLVER] LLM resolution failed:', error.message);
    return null;
  }
}

/**
 * Main entity resolution function
 * Follows priority: ISIN → LEI → CIK/ticker → legal_name → aliases (LLM)
 */
export async function resolveEntity(query: string): Promise<CompanyIdentifiers> {
  const logs: ResolutionLog[] = [];

  console.log(`[RESOLVER] Starting resolution for: "${query}"`);

  const queryType = detectQueryType(query);
  logs.push({ step: 'DETECT_TYPE', success: true, details: `Detected: ${queryType}` });

  // Step 1: ISIN lookup
  if (queryType === 'ISIN' || queryType === 'UNKNOWN') {
    const isinResult = await resolveByISIN(query);
    if (isinResult) {
      logs.push({ step: 'ISIN_LOOKUP', success: true, details: `Found via ISIN` });
      console.log(`[RESOLVER] ✅ Resolved via ISIN: ${isinResult.name}`);
      return isinResult;
    }
    logs.push({ step: 'ISIN_LOOKUP', success: false, details: 'No match found' });
  }

  // Step 2: LEI lookup
  if (queryType === 'LEI' || queryType === 'UNKNOWN') {
    const leiResult = await resolveByLEI(query);
    if (leiResult) {
      logs.push({ step: 'LEI_LOOKUP', success: true, details: `Found via LEI` });
      console.log(`[RESOLVER] ✅ Resolved via LEI: ${leiResult.name}`);
      return leiResult;
    }
    logs.push({ step: 'LEI_LOOKUP', success: false, details: 'No match found' });
  }

  // Step 3: CIK/Ticker lookup
  if (queryType === 'TICKER' || queryType === 'CIK' || queryType === 'UNKNOWN') {
    const tickerResult = await resolveByTickerOrCIK(query);
    if (tickerResult) {
      logs.push({ step: 'TICKER_CIK_LOOKUP', success: true, details: `Found via ticker/CIK` });
      console.log(`[RESOLVER] ✅ Resolved via ticker/CIK: ${tickerResult.name}`);
      return tickerResult;
    }
    logs.push({ step: 'TICKER_CIK_LOOKUP', success: false, details: 'No match found' });
  }

  // Step 4: Company name search
  if (queryType === 'COMPANY_NAME' || queryType === 'UNKNOWN') {
    const nameResult = await resolveByCompanyName(query);
    if (nameResult) {
      logs.push({ step: 'COMPANY_NAME_LOOKUP', success: true, details: `Found via company name search` });
      console.log(`[RESOLVER] ✅ Resolved via name search: ${nameResult.name}`);
      return nameResult;
    }
    logs.push({ step: 'COMPANY_NAME_LOOKUP', success: false, details: 'No match found' });
  }

  // Step 5: LLM fallback
  const llmResult = await resolveLLMFallback(query);
  if (llmResult) {
    logs.push({ step: 'LLM_FALLBACK', success: true, details: `LLM resolved to: ${llmResult.name}` });
    console.log(`[RESOLVER] ✅ LLM resolved to: ${llmResult.name}`);
    return llmResult;
  }

  // Final fallback: use query as-is
  logs.push({ step: 'FINAL_FALLBACK', success: true, details: 'Using query as-is' });
  console.log(`[RESOLVER] ⚠️ Using query as-is: ${query}`);

  const fallback: CompanyIdentifiers = {
    name: query,
    aliases: [query],
  };

  if (queryType === 'TICKER') {
    fallback.ticker = query.toUpperCase();
  }

  return fallback;
}
