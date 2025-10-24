import axios from 'axios';

export async function getYahooFinanceData(ticker: string) {
  try {
    console.log(`[YAHOO] Fetching data for ticker: ${ticker}`);

    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData,summaryProfile,summaryDetail`;

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    const result = data?.quoteSummary?.result?.[0];

    if (!result) {
      console.log(`[YAHOO] ⚠️ No data found for ${ticker}`);
      return { found: false };
    }

    console.log(`[YAHOO] ✅ Data found for ${ticker}`);

    return {
      found: true,
      companyName: result?.summaryProfile?.longName || result?.quoteType?.longName,
      industry: result?.summaryProfile?.industry,
      sector: result?.summaryProfile?.sector,
      country: result?.summaryProfile?.country,
      website: result?.summaryProfile?.website,
      employees: result?.summaryProfile?.fullTimeEmployees,
      marketCap: result?.summaryDetail?.marketCap?.raw,
      revenue: result?.financialData?.totalRevenue?.raw,
      debtToEquity: result?.financialData?.debtToEquity?.raw,
      description: result?.summaryProfile?.longBusinessSummary,
    };
  } catch (error) {
    console.error('[YAHOO] ❌ Error:', error);
    return { found: false };
  }
}

export async function guessTicker(companyName: string): Promise<string | null> {
  // Common ticker patterns - GLOBAL COMPANIES
  const commonTickers: Record<string, string> = {
    // US Companies
    'apple': 'AAPL',
    'microsoft': 'MSFT',
    'amazon': 'AMZN',
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'facebook': 'META',
    'meta': 'META',
    'tesla': 'TSLA',
    'nvidia': 'NVDA',
    'netflix': 'NFLX',
    'walmart': 'WMT',
    'jpmorgan': 'JPM',
    'berkshire': 'BRK-B',
    'visa': 'V',
    'mastercard': 'MA',
    'disney': 'DIS',
    'boeing': 'BA',
    'coca-cola': 'KO',
    'pepsi': 'PEP',
    'intel': 'INTC',
    'amd': 'AMD',
    'oracle': 'ORCL',
    'salesforce': 'CRM',
    'adobe': 'ADBE',
    'paypal': 'PYPL',
    'spotify': 'SPOT',
    'uber': 'UBER',
    'airbnb': 'ABNB',

    // Brazilian Companies
    'petrobras': 'PBR',
    'vale': 'VALE',
    'itau': 'ITUB',
    'itaú': 'ITUB',
    'bradesco': 'BBD',
    'ambev': 'ABEV',
    'banco do brasil': 'BBAS3.SA',
    'weg': 'WEGE3.SA',
    'magazine luiza': 'MGLU3.SA',
    'natura': 'NTCO3.SA',

    // European Companies
    'shell': 'SHEL',
    'bp': 'BP',
    'hsbc': 'HSBC',
    'unilever': 'UL',
    'nestle': 'NSRGY',
    'nestlé': 'NSRGY',
    'roche': 'RHHBY',
    'novartis': 'NVS',
    'sap': 'SAP',
    'siemens': 'SIEGY',
    'volkswagen': 'VWAGY',
    'airbus': 'EADSY',
    'total': 'TTE',
    'totalenergies': 'TTE',
    'bnp paribas': 'BNPQY',
    'santander': 'SAN',
    'astrazeneca': 'AZN',
    'diageo': 'DEO',
    'asml': 'ASML',
    'lvmh': 'LVMUY',
    'schneider': 'SBGSY',

    // Asian Companies
    'toyota': 'TM',
    'samsung': '005930.KS',
    'tsmc': 'TSM',
    'taiwan semiconductor': 'TSM',
    'alibaba': 'BABA',
    'tencent': 'TCEHY',
    'sony': 'SONY',
    'softbank': 'SFTBY',
    'nintendo': 'NTDOY',
    'honda': 'HMC',
    'mitsubishi': 'MSBHY',
    'rakuten': 'RKUNY',
    'baidu': 'BIDU',
    'jd.com': 'JD',
    'nio': 'NIO',
    'byd': 'BYDDY',
    'xiaomi': 'XIACY',
    'infosys': 'INFY',
    'tata': 'TTM',
    'reliance': 'RELIANCE.NS',

    // Australian Companies
    'bhp': 'BHP',
    'rio tinto': 'RIO',
    'csl': 'CSLLY',
    'commonwealth bank': 'CMWAY',
    'woolworths': 'WOLWY',

    // Canadian Companies
    'shopify': 'SHOP',
    'royal bank': 'RY',
    'td bank': 'TD',
    'canadian national': 'CNI',
    'brookfield': 'BAM',
    'barrick': 'GOLD',
  };

  const normalized = companyName.toLowerCase();
  for (const [key, ticker] of Object.entries(commonTickers)) {
    if (normalized.includes(key)) {
      return ticker;
    }
  }

  return null;
}