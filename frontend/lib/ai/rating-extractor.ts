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
    const snippet = html
      .slice(0, 15000)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    const { object } = await generateObject({
      model: groq('llama-3.2-90b-text-preview'),
      schema: RatingSchema,
      prompt: `You are extracting credit rating data from ${agency.toUpperCase()}.

Company search: "${companyName}"

${agency.toUpperCase()} Rating Formats: ${RATING_FORMATS[agency]}

HTML Content:
${snippet}

Task:
1. Find the company (name may vary slightly)
2. Extract the EXACT credit rating (must match format above)
3. Extract outlook: Stable, Positive, Negative, Watch, Developing, or N/A
4. Determine confidence (0.0-1.0): how certain are you?
5. Only set found=true if confidence >= 0.75 AND rating matches valid format

IMPORTANT:
- Rating must EXACTLY match one of the valid formats listed
- If you see multiple ratings, choose the Long-Term Issuer Default Rating or Senior Unsecured
- Be conservative with confidence scores

Return JSON only.`,
    });

    console.log(`[${agency}] 🤖 LLM Result:`, object);

    if (object.found && object.rating) {
      const validRatings = RATING_FORMATS[agency].split(', ');
      if (!validRatings.includes(object.rating)) {
        console.log(`[${agency}] ⚠️ Invalid rating format: ${object.rating}`);
        return { found: false, confidence: 0 };
      }
    }

    return object;

  } catch (error) {
    console.error(`[${agency}] ❌ Extraction error:`, error);
    return { found: false, confidence: 0 };
  }
}