import axios from 'axios';
import * as cheerio from 'cheerio';

export async function getWikipediaData(companyName: string) {
  try {
    console.log(`[WIKIPEDIA] Searching for: ${companyName}`);

    // Search Wikipedia
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(companyName)}&limit=1&format=json`;
    const { data: searchData } = await axios.get(searchUrl, { timeout: 10000 });

    if (!searchData[3] || !searchData[3][0]) {
      console.log(`[WIKIPEDIA] ⚠️ No page found`);
      return { found: false };
    }

    const pageUrl = searchData[3][0];
    console.log(`[WIKIPEDIA] Found page: ${pageUrl}`);

    const { data: html } = await axios.get(pageUrl, { timeout: 10000 });
    const $ = cheerio.load(html);

    // Extract from infobox
    const infobox: Record<string, string> = {};
    $('.infobox tr').each((i, el) => {
      const label = $(el).find('th').text().trim().toLowerCase();
      const value = $(el).find('td').text().trim();
      if (label && value) {
        infobox[label] = value;
      }
    });

    console.log(`[WIKIPEDIA] ✅ Extracted ${Object.keys(infobox).length} fields`);

    return {
      found: true,
      ticker: infobox['traded as'] || infobox['ticker symbol'],
      isin: infobox['isin'],
      industry: infobox['industry'],
      founded: infobox['founded'],
      headquarters: infobox['headquarters'],
      rating: infobox['credit rating'],
      type: infobox['type'],
      revenue: infobox['revenue'],
    };
  } catch (error) {
    console.error('[WIKIPEDIA] ❌ Error:', error);
    return { found: false };
  }
}