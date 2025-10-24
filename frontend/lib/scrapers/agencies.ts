import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const { data } = await axios.get(url, {
        headers: HEADERS,
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return '';
}

export async function searchFitch(companyName: string): Promise<string> {
  console.log(`[FITCH] Searching: ${companyName}`);
  try {
    const url = `https://www.fitchratings.com/search?query=${encodeURIComponent(companyName)}`;
    const html = await fetchWithRetry(url);
    console.log(`[FITCH] ✅ Fetched ${html.length} chars`);
    return html;
  } catch (error) {
    console.error(`[FITCH] ❌ Error:`, error);
    return '';
  }
}

export async function searchSP(companyName: string): Promise<string> {
  console.log(`[S&P] Searching: ${companyName}`);
  try {
    const url = `https://www.spglobal.com/ratings/en/search-results?query=${encodeURIComponent(companyName)}`;
    const html = await fetchWithRetry(url);
    console.log(`[S&P] ✅ Fetched ${html.length} chars`);
    return html;
  } catch (error) {
    console.error(`[S&P] ❌ Error:`, error);
    return '';
  }
}

export async function searchMoodys(companyName: string): Promise<string> {
  console.log(`[MOODYS] Searching: ${companyName}`);
  try {
    const url = `https://www.moodys.com/search?q=${encodeURIComponent(companyName)}`;
    const html = await fetchWithRetry(url);
    console.log(`[MOODYS] ✅ Fetched ${html.length} chars`);
    return html;
  } catch (error) {
    console.error(`[MOODYS] ❌ Error:`, error);
    return '';
  }
}