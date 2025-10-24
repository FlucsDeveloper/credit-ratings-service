import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function generateCompanyVariations(companyName: string): Promise<string[]> {
  try {
    const { text } = await generateText({
      model: google('gemini-2.0-flash-exp'),
      prompt: `Generate exactly 8 name variations for: "${companyName}"

Include:
1. Full legal name with suffix
2. Name without Inc/Ltd/Corp/SA
3. Stock ticker symbol (if applicable)
4. All caps version
5. Common abbreviation
6. Parent company (if subsidiary)
7. Alternative spelling
8. Short form

Return ONLY a JSON array of strings, nothing else.
Example: ["Apple Inc.", "Apple", "AAPL", "APPLE INC", "Apple Computer", "Apple Inc", "Aple", "AAPL Inc"]`,
    });

    const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const variations = JSON.parse(cleaned);

    console.log(`✅ Generated ${variations.length} variations for "${companyName}":`, variations);
    return Array.isArray(variations) ? variations : [companyName];

  } catch (error) {
    console.error('⚠️ Entity resolver failed:', error);
    return [
      companyName,
      companyName.replace(/[,.]$/g, ''),
      companyName.replace(/\s+(Inc|Ltd|SA|Corp|Corporation|Company|Plc)\.?$/gi, '').trim(),
      companyName.toUpperCase(),
      companyName.split(' ')[0],
    ];
  }
}