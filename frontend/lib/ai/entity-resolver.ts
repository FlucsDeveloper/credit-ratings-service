import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function generateCompanyVariations(
  companyName: string,
  ticker?: string,
  country?: string
): Promise<string[]> {
  try {
    const contextInfo = [
      `Company: "${companyName}"`,
      ticker ? `Ticker: "${ticker}"` : '',
      country ? `Country: "${country}"` : '',
    ].filter(Boolean).join('\n');

    const { text } = await generateText({
      model: google('gemini-2.0-flash-exp'),
      prompt: `Generate 15 name variations for credit rating agency searches.

${contextInfo}

Generate variations including:
1. Full official legal name
2. Name without suffix (Inc, Ltd, Corp, SA, etc)
3. Stock ticker ${ticker ? `(${ticker})` : ''}
4. All UPPERCASE version
5. Common abbreviation
6. Parent company (if subsidiary)
7. Alternative spellings
8. Name with "Company" appended
9. Name with "Corporation" appended
10. Former names (if well-known)
11. Brand name (if different)
12. Local language name
13. First word only
14. First two words only
15. Acronym (if applicable)

Return ONLY a JSON array of unique strings.
Example: ["Apple Inc.", "Apple", "AAPL", "APPLE INC", "Apple Computer", ...]`,
      maxTokens: 400,
      temperature: 0.7,
    });

    const cleaned = text.trim()
      .replace(/```json\n?/g, '')
      .replace(/```/g, '')
      .trim();

    let variations: string[] = [];
    try {
      variations = JSON.parse(cleaned);
    } catch {
      variations = [companyName];
    }

    // Add guaranteed variations
    const guaranteed = [
      companyName,
      companyName.replace(/[,.]$/g, ''),
      companyName.replace(/\s+(Inc|Ltd|SA|Corp|Corporation|Company|Plc|LLC|LP|LLP|NV|AG|SpA|GmbH|SE|ASA|AB|Oy|BV|SL|SAS|KG)\.?$/gi, '').trim(),
      companyName.toUpperCase(),
      companyName.split(' ')[0],
      companyName.split(' ').slice(0, 2).join(' '),
    ];

    if (ticker) {
      guaranteed.push(ticker);
      guaranteed.push(ticker.toUpperCase());
      guaranteed.push(ticker.toLowerCase());
    }

    // Combine and deduplicate
    const combined = [...new Set([...variations, ...guaranteed])].filter(v => v && v.length > 0);

    console.log(`✅ Generated ${combined.length} variations for "${companyName}"`);
    return combined;

  } catch (error) {
    console.error('⚠️ Entity resolver failed:', error);

    const fallback = [
      companyName,
      companyName.replace(/[,.]$/g, ''),
      companyName.replace(/\s+(Inc|Ltd|SA|Corp|Corporation|Company|Plc|LLC)\.?$/gi, '').trim(),
      companyName.toUpperCase(),
      companyName.split(' ')[0],
    ];

    if (ticker) {
      fallback.push(ticker);
      fallback.push(ticker.toUpperCase());
    }

    return [...new Set(fallback)];
  }
}