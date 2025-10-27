/**
 * Deepseek LLM Integration
 *
 * Provides LLM-powered company alias expansion using Deepseek API.
 * Falls back gracefully if API key is missing.
 */

export interface AliasExpansionOptions {
  maxAliases?: number;
  includeSubsidiaries?: boolean;
}

/**
 * Expand company name/ticker into possible aliases using Deepseek LLM
 * @param query Company name or ticker
 * @param options Expansion options
 * @returns Array of alias candidates (empty if API key missing)
 */
export async function expandCompanyAliasesLLM(
  query: string,
  options: AliasExpansionOptions = {}
): Promise<string[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey || apiKey === "REPLACE") {
    console.log("[deepseek] DEEPSEEK_API_KEY not configured, skipping LLM expansion");
    return [];
  }

  const { maxAliases = 10, includeSubsidiaries = false } = options;

  try {
    const prompt = buildAliasPrompt(query, includeSubsidiaries);

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are a financial entity resolver. Return only JSON arrays of company name variations.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[deepseek] API error: ${response.status} ${errorText}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("[deepseek] No content in response");
      return [];
    }

    // Parse JSON array from response
    const aliases = parseAliasResponse(content);
    const limited = aliases.slice(0, maxAliases);

    console.log(`[deepseek] Expanded "${query}" → ${limited.length} aliases`);

    return limited;
  } catch (error) {
    console.error(`[deepseek] Error expanding aliases for "${query}":`, error);
    return [];
  }
}

/**
 * Build the prompt for alias expansion
 */
function buildAliasPrompt(query: string, includeSubsidiaries: boolean): string {
  const subsidiaryClause = includeSubsidiaries
    ? " Include common subsidiary names if applicable (e.g., 'XYZ Bank', 'XYZ Payments')."
    : "";

  return `Given the company name or ticker "${query}", provide 5-10 possible name variations and aliases that credit rating agencies or financial news might use.

Include:
- Legal name variations (with/without legal suffixes like Inc., Corp., S.A., etc.)
- Stock ticker if company name given, or company name if ticker given
- Common abbreviations and acronyms
- Diacritic variations (e.g., "Nubank" vs "Nu Holdings")
- Brand names vs legal names (e.g., "Meta" vs "Meta Platforms Inc")${subsidiaryClause}

Return ONLY a JSON array of strings, nothing else. Example: ["Apple Inc", "Apple", "AAPL", "Apple Computer Inc"]`;
}

/**
 * Parse the LLM response to extract alias array
 */
function parseAliasResponse(content: string): string[] {
  try {
    // Try direct JSON parse first
    const parsed = JSON.parse(content.trim());
    if (Array.isArray(parsed)) {
      return parsed.filter(item => typeof item === "string" && item.length > 0);
    }

    // If wrapped in markdown code block
    const codeBlockMatch = content.match(/```(?:json)?\s*(\[.*?\])\s*```/s);
    if (codeBlockMatch) {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => typeof item === "string" && item.length > 0);
      }
    }

    // Try to find JSON array anywhere in the response
    const arrayMatch = content.match(/\[.*?\]/s);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => typeof item === "string" && item.length > 0);
      }
    }

    console.warn("[deepseek] Could not parse aliases from response:", content);
    return [];
  } catch (error) {
    console.error("[deepseek] Error parsing response:", error);
    return [];
  }
}

/**
 * Batch expand multiple queries (with concurrency limit)
 */
export async function expandCompanyAliasesBatch(
  queries: string[],
  concurrency = 3
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();

  // Process in batches
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async q => {
        const aliases = await expandCompanyAliasesLLM(q);
        return { query: q, aliases };
      })
    );

    batchResults.forEach(({ query, aliases }) => {
      results.set(query, aliases);
    });
  }

  return results;
}
