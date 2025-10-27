/**
 * Direct Agency URL Construction
 *
 * Instead of relying solely on search, construct direct URLs to known
 * rating page patterns for each agency.
 */

export interface DirectURLs {
  moodys: string[];
  sp: string[];
  fitch: string[];
}

/**
 * Generate direct URLs to agency rating pages
 * @param companyName Company name
 * @param ticker Optional stock ticker
 * @returns Direct URLs for each agency
 */
export function generateDirectAgencyURLs(companyName: string, ticker?: string): DirectURLs {
  const normalizedName = companyName.replace(/[^\w\s]/g, '').replace(/\s+/g, '-').toLowerCase();
  const tickerLower = ticker?.toLowerCase();

  return {
    moodys: [
      // Moody's search results page
      `https://www.moodys.com/search?q=${encodeURIComponent(companyName)}`,
      // Moody's credit ratings page
      `https://ratings.moodys.com/search?query=${encodeURIComponent(companyName)}`,
      // Alternative search
      `https://www.moodys.com/researchandratings/search?q=${encodeURIComponent(companyName)}`,
    ],

    sp: [
      // S&P Global ratings search
      `https://www.spglobal.com/ratings/en/search-results?query=${encodeURIComponent(companyName)}`,
      // S&P disclosure platform
      `https://disclosure.spglobal.com/ratings/en/regulatory/search/entity?query=${encodeURIComponent(companyName)}`,
      // Alternative patterns
      `https://www.spglobal.com/ratings/en/search?query=${encodeURIComponent(companyName)}&contentType=Rating`,
    ],

    fitch: [
      // Fitch ratings search
      `https://www.fitchratings.com/search?query=${encodeURIComponent(companyName)}&filter=type:Rating%20Action`,
      // Fitch entity search
      `https://www.fitchratings.com/entity/${normalizedName}`,
      // Alternative search
      `https://www.fitchratings.com/search?query=${encodeURIComponent(companyName)}&content=Ratings`,
    ],
  };
}

/**
 * Fallback IR (Investor Relations) page URLs
 * Many companies publish their ratings on IR pages
 */
export function generateIRPageURLs(companyName: string, ticker?: string): string[] {
  const domain = guessDomain(companyName);
  const urls: string[] = [];

  if (domain) {
    urls.push(
      `https://ir.${domain}/credit-ratings`,
      `https://ir.${domain}/debt-ratings`,
      `https://investor.${domain}/credit-ratings`,
      `https://investors.${domain}/ratings`,
      `https://${domain}/investors/credit-ratings`,
      `https://${domain}/investor-relations/credit-ratings`,
    );
  }

  return urls;
}

/**
 * Guess company domain from name
 */
function guessDomain(companyName: string): string | null {
  const lowerName = companyName.toLowerCase();

  // Well-known mappings
  const knownDomains: Record<string, string> = {
    'apple': 'apple.com',
    'microsoft': 'microsoft.com',
    'amazon': 'amazon.com',
    'google': 'abc.xyz',
    'alphabet': 'abc.xyz',
    'meta': 'meta.com',
    'facebook': 'meta.com',
    'tesla': 'tesla.com',
    'jpmorgan': 'jpmorganchase.com',
    'jp morgan': 'jpmorganchase.com',
    'bank of america': 'bankofamerica.com',
    'wells fargo': 'wellsfargo.com',
    'citigroup': 'citigroup.com',
    'goldman sachs': 'goldmansachs.com',
    'morgan stanley': 'morganstanley.com',
    'walmart': 'walmart.com',
    'exxon': 'exxonmobil.com',
    'exxon mobil': 'exxonmobil.com',
    'chevron': 'chevron.com',
    'johnson & johnson': 'jnj.com',
    'johnson and johnson': 'jnj.com',
    'procter & gamble': 'pg.com',
    'coca-cola': 'coca-colacompany.com',
    'coca cola': 'coca-colacompany.com',
    'pepsico': 'pepsico.com',
    'verizon': 'verizon.com',
    'at&t': 'att.com',
    't-mobile': 't-mobile.com',
    'petrobras': 'petrobras.com.br',
    'vale': 'vale.com',
    'itau': 'itau.com.br',
    'itaú': 'itau.com.br',
    'bradesco': 'bradesco.com.br',
    'nubank': 'nu.com.mx',
    'btg pactual': 'btgpactual.com',
  };

  // Check known domains
  for (const [key, domain] of Object.entries(knownDomains)) {
    if (lowerName.includes(key)) {
      return domain;
    }
  }

  // Try to construct from first word
  const firstWord = lowerName.split(/\s+/)[0];
  if (firstWord.length >= 4) {
    return `${firstWord}.com`;
  }

  return null;
}
