import { generateObject } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const RatingSchema = z.object({
  found: z.boolean(),
  rating: z.string().optional(),
  outlook: z.enum(['Stable', 'Positive', 'Negative', 'Watch', 'Developing', 'N/A']).optional(),
  confidence: z.number().min(0).max(1),
  companyName: z.string().optional(),
});

const RATING_FORMATS = {
  fitch: 'AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+, BB, BB-, B+, B, B-, CCC+, CCC, CCC-, CC, C, D',
  sp: 'AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+, BB, BB-, B+, B, B-, CCC+, CCC, CCC-, CC, C, D, SD, NR',
  moodys: 'Aaa, Aa1, Aa2, Aa3, A1, A2, A3, Baa1, Baa2, Baa3, Ba1, Ba2, Ba3, B1, B2, B3, Caa1, Caa2, Caa3, Ca, C'
};

export async function extractRating(
  html: string,
  companyName: string,
  agency: 'fitch' | 'sp' | 'moodys'
): Promise<z.infer<typeof RatingSchema>> {

  if (!html || html.length < 100) {
    console.log(`[${agency}] ⚠️ HTML too short or empty`);
    return { found: false, confidence: 0 };
  }

  try {
    // Clean HTML more aggressively
    const cleaned = html
      .slice(0, 20000) // Take first 20k chars
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    console.log(`[${agency}] 📝 Cleaned HTML: ${cleaned.length} chars`);

    // Try to find rating patterns manually first
    const manualPatterns = {
      fitch: [
        /Long-Term\s+(?:Issuer\s+Default\s+)?Rating[:\s]+(AA\+|AA-|AA|A\+|A-|A|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|B|CCC|CC|C|D)/gi,
        /IDR[:\s]+(AA\+|AA-|AA|A\+|A-|A|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|B|CCC|CC|C|D)/gi,
        /Rating[:\s]+(AAA|AA\+|AA-|AA|A\+|A-|A|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|B|CCC|CC|C|D)/gi,
      ],
      sp: [
        /Long-Term\s+(?:Issuer\s+)?Credit\s+Rating[:\s]+(AA\+|AA-|AA|A\+|A-|A|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|B|CCC|CC|C|D)/gi,
        /Issuer\s+Credit\s+Rating[:\s]+(AA\+|AA-|AA|A\+|A-|A|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|B|CCC|CC|C|D)/gi,
        /Rating[:\s]+(AAA|AA\+|AA-|AA|A\+|A-|A|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|B|CCC|CC|C|D)/gi,
      ],
      moodys: [
        /Long-Term\s+(?:Issuer\s+)?Rating[:\s]+(Aaa|Aa1|Aa2|Aa3|A1|A2|A3|Baa1|Baa2|Baa3|Ba1|Ba2|Ba3|B1|B2|B3|Caa1|Caa2|Caa3|Ca|C)/gi,
        /Senior\s+Unsecured[:\s]+(Aaa|Aa1|Aa2|Aa3|A1|A2|A3|Baa1|Baa2|Baa3|Ba1|Ba2|Ba3|B1|B2|B3|Caa1|Caa2|Caa3|Ca|C)/gi,
        /Rating[:\s]+(Aaa|Aa1|Aa2|Aa3|A1|A2|A3|Baa1|Baa2|Baa3|Ba1|Ba2|Ba3|B1|B2|B3|Caa1|Caa2|Caa3|Ca|C)/gi,
      ],
    };

    const patterns = manualPatterns[agency];
    for (const pattern of patterns) {
      const matches = cleaned.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`[${agency}] 🎯 Manual pattern match found:`, matches[0]);
        const ratingMatch = matches[0].match(/([A-Z][a-z]{0,2}[0-9]?[\+\-]?)$/);
        if (ratingMatch) {
          const rating = ratingMatch[1];
          console.log(`[${agency}] ✅ Manual extraction successful: ${rating}`);

          // Validate it's in our scale
          const validRatings = RATING_FORMATS[agency].split(', ');
          if (validRatings.includes(rating)) {
            return {
              found: true,
              rating,
              confidence: 0.85,
              outlook: 'N/A',
              companyName,
            };
          }
        }
      }
    }

    console.log(`[${agency}] 🤖 No manual pattern match, trying LLM...`);

    // Use LLM with enhanced prompt (using mode: 'json' for compatibility)
    const { object } = await generateObject({
      model: groq('llama-3.3-70b-versatile'),
      schema: RatingSchema,
      mode: 'json',  // Use JSON mode instead of json_schema for better compatibility
      prompt: `You are a precise credit rating extractor. Extract ONLY if you are CERTAIN.

COMPANY: "${companyName}"
AGENCY: ${agency.toUpperCase()}

VALID RATINGS FOR ${agency.toUpperCase()}:
${RATING_FORMATS[agency]}

HTML CONTENT (cleaned):
${cleaned}

INSTRUCTIONS:

1. Search for "${companyName}" or similar (case-insensitive)
2. Look for these exact phrases:
   - "Long-Term Rating"
   - "Issuer Default Rating" or "IDR"
   - "Credit Rating"
   - "Senior Unsecured Rating"
3. Extract the rating that appears immediately after these phrases
4. Rating MUST be from the valid list above (exact match)
5. Find outlook: Stable, Positive, Negative, Watch, Developing, or N/A
6. Set confidence based on certainty:
   - 0.95: Found exact company name + exact rating + clear context
   - 0.85: Found similar company name + exact rating
   - 0.75: Found rating but uncertain about company match
   - <0.70: Not confident

CRITICAL: Set found=true ONLY if:
- Rating is EXACT match from valid list
- Confidence >= 0.75
- Company name match (even if approximate)

If you cannot find a clear rating, set found=false and confidence=0.

Return JSON only, no explanations.`,
      maxTokens: 300,
      temperature: 0,
    });

    console.log(`[${agency}] 🤖 LLM extraction result:`, object);

    // Validate LLM result
    if (object.found && object.rating) {
      const validRatings = RATING_FORMATS[agency].split(', ');
      if (!validRatings.includes(object.rating)) {
        console.log(`[${agency}] ⚠️ Invalid rating format from LLM: ${object.rating}`);
        return { found: false, confidence: 0 };
      }
    }

    return object;

  } catch (error) {
    console.error(`[${agency}] ❌ Extraction error:`, error);
    return { found: false, confidence: 0 };
  }
}