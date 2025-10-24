import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0',
};

async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      console.log(`      [HTTP] Attempt ${i + 1}/${retries + 1}: ${url}`);

      const { data, status, headers } = await axios.get(url, {
        headers: HEADERS,
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      console.log(`      [HTTP] Status: ${status}, Content-Length: ${headers['content-length'] || 'unknown'}`);

      if (status >= 200 && status < 300) {
        const html = typeof data === 'string' ? data : JSON.stringify(data);
        console.log(`      [HTTP] ✅ Success: ${html.length} bytes`);
        return html;
      } else if (status === 404) {
        console.log(`      [HTTP] ❌ 404 Not Found`);
        return '';
      } else if (status === 403) {
        console.log(`      [HTTP] ⚠️ 403 Forbidden - possible bot detection`);
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
          continue;
        }
        return '';
      } else {
        console.log(`      [HTTP] ⚠️ Unexpected status: ${status}`);
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        return '';
      }

    } catch (error: any) {
      console.error(`      [HTTP] ❌ Error: ${error.message}`);
      if (i === retries) {
        return '';
      }
      await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1)));
    }
  }
  return '';
}

export async function searchFitch(companyName: string): Promise<string> {
  console.log(`   [FITCH] Searching: ${companyName}`);
  try {
    const url = `https://www.fitchratings.com/search?query=${encodeURIComponent(companyName)}`;
    const html = await fetchWithRetry(url);
    return html;
  } catch (error) {
    console.error(`   [FITCH] ❌ Fatal error:`, error);
    return '';
  }
}

export async function searchSP(companyName: string): Promise<string> {
  console.log(`   [S&P] Searching: ${companyName}`);
  try {
    const url = `https://www.spglobal.com/ratings/en/search-results?query=${encodeURIComponent(companyName)}`;
    const html = await fetchWithRetry(url);
    return html;
  } catch (error) {
    console.error(`   [S&P] ❌ Fatal error:`, error);
    return '';
  }
}

export async function searchMoodys(companyName: string): Promise<string> {
  console.log(`   [MOODYS] Searching: ${companyName}`);
  try {
    const url = `https://www.moodys.com/search?q=${encodeURIComponent(companyName)}`;
    const html = await fetchWithRetry(url);
    return html;
  } catch (error) {
    console.error(`   [MOODYS] ❌ Fatal error:`, error);
    return '';
  }
}