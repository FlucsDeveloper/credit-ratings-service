import { getJson } from "serpapi";

type Hit = { url: string; title: string; snippet: string };

function uniq<T>(arr: T[], key: (t:T)=>string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

export async function searchAgency(companyAliases: string[], limit = 12): Promise<Hit[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key || key === "REPLACE") {
    console.log("[agency-search] SERPAPI_API_KEY not configured, returning empty results");
    return [];
  }

  const name = companyAliases[0] || "";
  const quoted = `"${name}"`;
  const also = companyAliases.slice(1, 3).map(a => `"${a}"`).join(" OR ");
  const nameBlock = also ? `(${quoted} OR ${also})` : quoted;

  // Tiered queries per PRD: prioritize IR/press releases over direct agency sites (which are often blocked)
  const tiers = [
    // T1 - issuer IR pages (most reliable, usually public)
    [
      `${nameBlock} site:ir.* (Moody's OR Fitch OR "S&P") (rating OR outlook OR affirms OR assigns)`,
      `${nameBlock} (investor relations OR RI) (Moody's OR Fitch OR "S&P") (rating OR outlook)`,
    ],
    // T2 - reputable newswires (PRNewswire, BusinessWire - always public)
    [
      `site:prnewswire.com ${nameBlock} (Moody's OR Fitch OR "S&P") (rating OR outlook OR affirms)`,
      `site:businesswire.com ${nameBlock} (Moody's OR Fitch OR "S&P") (rating OR outlook OR affirms)`,
      `site:reuters.com ${nameBlock} (Moody's OR Fitch OR "S&P") rating`,
      `site:bloomberg.com ${nameBlock} (Moody's OR Fitch OR "S&P") rating`,
    ],
    // T3 - agency sites (try but expect blocks)
    [
      `site:spglobal.com/ratings ${nameBlock} (affirms OR upgrades OR downgrades OR assigned)`,
      `site:moodys.com ${nameBlock} (assigns OR affirms OR changes outlook OR withdraws)`,
      `site:fitchratings.com ${nameBlock} (IDR OR affirms OR downgrades OR upgrades)`,
    ],
    // T4 - fallback: general press releases
    [
      `${nameBlock} "press release" (Moody's OR Fitch OR "S&P") rating`,
      `${nameBlock} announcement (Moody's OR Fitch OR "S&P") (rating OR outlook)`,
    ],
  ];

  const out: Hit[] = [];

  // Try each tier until we get enough results
  for (const tierQueries of tiers) {
    for (const q of tierQueries) {
      try {
        const params: any = { engine: "google", q, num: 8, hl: "en", api_key: key };
        const res = await getJson(params);
        const hits = (res?.organic_results ?? []).map((r: any) => ({
          url: r.link as string,
          title: r.title as string,
          snippet: r.snippet as string,
        })).filter((h: Hit) => h.url && !/accounts\.|login|paywall|subscribe|methodology|glossary|scale/i.test(h.url));
        out.push(...hits);
      } catch (err) {
        console.error(`[agency-search] Error searching: ${q}`, err);
      }
    }

    // De-dupe and check if we have enough
    const deduped = uniq(out, h => h.url);
    if (deduped.length >= 8) {
      console.log(`[agency-search] Found ${deduped.length} results after tier`);
      return deduped.slice(0, limit);
    }
  }

  console.log(`[agency-search] Found ${out.length} total results across all tiers`);
  return uniq(out, h => h.url).slice(0, limit);
}
