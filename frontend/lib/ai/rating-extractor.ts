import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

/**
 * Multi-Provider LLM Rating Extractor V2
 * SPECIALIZED EXPERT SYSTEM for credit rating extraction
 *
 * Uses few-shot learning and expert persona for better accuracy
 */

// Provider configurations
const providers = {
  openai: {
    enabled: !!process.env.OPENAI_API_KEY,
    client: process.env.OPENAI_API_KEY ? createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }) : null,
    model: 'gpt-4o-mini',
    name: 'OpenAI GPT-4o-mini'
  },
  deepseek: {
    enabled: !!process.env.DEEPSEEK_API_KEY,
    client: process.env.DEEPSEEK_API_KEY ? createOpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
    }) : null,
    model: 'deepseek-chat',
    name: 'DeepSeek-V2'
  },
  ollama: {
    enabled: !!process.env.OLLAMA_BASE_URL || false,
    client: process.env.OLLAMA_BASE_URL ? createOpenAI({
      apiKey: 'ollama',
      baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    }) : null,
    model: 'llama3.1:8b',
    name: 'Ollama (local)'
  }
};

// Determine active provider
const forcedProvider = process.env.LLM_PROVIDER as keyof typeof providers | 'none' | undefined;
let activeProvider: keyof typeof providers | null = null;

if (forcedProvider === 'none') {
  activeProvider = null;
} else if (forcedProvider && providers[forcedProvider]?.enabled) {
  activeProvider = forcedProvider;
} else {
  if (providers.openai.enabled) activeProvider = 'openai';
  else if (providers.deepseek.enabled) activeProvider = 'deepseek';
  else if (providers.ollama.enabled) activeProvider = 'ollama';
}

const RatingSchema = z.object({
  found: z.boolean(),
  rating: z.string().optional(),
  outlook: z.enum(['Stable', 'Positive', 'Negative', 'Watch', 'Developing', 'N/A']).optional(),
  date: z.string().optional(),
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

  if (!html || html.length < 50) {
    console.log(`[${agency}] ⚠️ HTML too short or empty (${html?.length || 0} chars)`);
    return { found: false, confidence: 0 };
  }

  // Check if LLM is available
  if (!activeProvider) {
    console.log(`[${agency}] ⚠️ No LLM provider configured`);
    return { found: false, confidence: 0 };
  }

  const provider = providers[activeProvider];
  console.log(`[${agency}] 🚀 Using LLM provider: ${provider.name}`);

  try {
    // Clean HTML aggressively
    const cleaned = html
      .slice(0, 20000)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    console.log(`[${agency}] 📝 Cleaned HTML: ${cleaned.length} chars`);

    // EXPERT SYSTEM: Few-shot learning with examples
    const { text } = await generateText({
      model: provider.client!.chat(provider.model),
      messages: [
        {
          role: 'system',
          content: `Você é um modelo de linguagem especializado em extrair informações de crédito (rating, perspectiva e data) de páginas públicas.

CONTEXTO MULTILÍNGUE:
- O HTML pode estar em português, espanhol ou inglês
- Ratings podem ter notações locais: AA(bra), A1.mx, Baa3.br, AAA(arg), BBB+(col), etc.
- Fontes incluem: agências globais (S&P, Fitch, Moody's), Investor Relations, press releases, filings públicos

PADRÕES LINGUÍSTICOS (Português/Espanhol/Inglês):
- Português: "rating atribuído", "classificação de risco", "perspectiva estável/positiva/negativa", "data de atribuição"
- Espanhol: "calificación asignada", "perspectiva estable/positiva/negativa", "fecha de asignación"
- Inglês: "rating assigned", "affirmed", "outlook stable/positive/negative", "as of date"

MÁXIMA SENSIBILIDADE:
- Detecte variações: "assigned", "affirmed", "rated", "holds", "maintains", "upgraded", "downgraded", "atribuído", "mantido", "elevado", "rebaixado", "asignado", "afirmado"
- Linguagem indireta válida: "The company holds an A3 rating", "Nubank mantém rating BB- da Fitch", "La empresa tiene calificación AA+"
- HTMLs curtos (<1000 chars) exigem atenção especial
- Aceite notações locais e globais

REGRAS CRÍTICAS:
- Rating DEVE estar na escala da agência (incluindo notações locais)
- Ignore ratings de produtos ou clientes — SOMENTE da empresa/companhia
- Se encontrar evidência clara, extraia mesmo com baixo contexto
- Retorne found=false SOMENTE se não houver menção de rating corporativo
- Nunca invente valores - apenas extraia o explícito

RESPONDA SOMENTE COM JSON VÁLIDO.`
        },
        {
          role: 'user',
          content: `EXAMPLE 1 - Perfect Match:

HTML: "Microsoft Corporation - Long-Term Issuer Credit Rating: AAA/Stable. Last updated January 15, 2025."
COMPANY: "Microsoft"
AGENCY: S&P
VALID RATINGS: AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+, BB, BB-, B+, B, B-, CCC+, CCC, CCC-, CC, C, D

Extract:`
        },
        {
          role: 'assistant',
          content: `{"found":true,"rating":"AAA","outlook":"Stable","date":"2025-01-15","confidence":0.95,"companyName":"Microsoft Corporation"}`
        },
        {
          role: 'user',
          content: `EXAMPLE 2 - Not Found:

HTML: "Search results for XYZ Corp. No rating information available."
COMPANY: "XYZ Corp"
AGENCY: Fitch
VALID RATINGS: AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+, BB, BB-, B+, B, B-, CCC+, CCC, CCC-, CC, C, D

Extract:`
        },
        {
          role: 'assistant',
          content: `{"found":false,"confidence":0}`
        },
        {
          role: 'user',
          content: `EXAMPLE 3 - Good Match:

HTML: "Tesla Inc. BB+/Negative as of March 1, 2024. Speculative grade."
COMPANY: "Tesla"
AGENCY: S&P
VALID RATINGS: AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+, BB, BB-, B+, B, B-, CCC+, CCC, CCC-, CC, C, D

Extract:`
        },
        {
          role: 'assistant',
          content: `{"found":true,"rating":"BB+","outlook":"Negative","date":"2024-03-01","confidence":0.90,"companyName":"Tesla Inc"}`
        },
        {
          role: 'user',
          content: `EXAMPLE 4 - Linguagem Indireta (Válido):

HTML: "The company holds an A3 rating by Moody's Investors Service with stable outlook."
COMPANY: "Acme Corp"
AGENCY: Moody's
VALID RATINGS: Aaa, Aa1, Aa2, Aa3, A1, A2, A3, Baa1, Baa2, Baa3, Ba1, Ba2, Ba3, B1, B2, B3, Caa1, Caa2, Caa3, Ca, C

Extract:`
        },
        {
          role: 'assistant',
          content: `{"found":true,"rating":"A3","outlook":"Stable","confidence":0.85,"companyName":"Acme Corp"}`
        },
        {
          role: 'user',
          content: `EXAMPLE 5 - HTML Curto com Rating Válido:

HTML: "Nubank - Fitch: BB- (Stable)"
COMPANY: "Nubank"
AGENCY: Fitch
VALID RATINGS: AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+, BB, BB-, B+, B, B-, CCC+, CCC, CCC-, CC, C, D

Extract:`
        },
        {
          role: 'assistant',
          content: `{"found":true,"rating":"BB-","outlook":"Stable","confidence":0.88,"companyName":"Nubank"}`
        },
        {
          role: 'user',
          content: `EXAMPLE 6 - LATAM (Português - Rating Local):

HTML: "A Fitch Ratings atribuiu à Raízen rating nacional de longo prazo AA(bra) com perspectiva estável em dezembro de 2024."
COMPANY: "Raízen"
AGENCY: Fitch
VALID RATINGS: AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+, BB, BB-, B+, B, B-, CCC+, CCC, CCC-, CC, C, D

Extract:`
        },
        {
          role: 'assistant',
          content: `{"found":true,"rating":"AA(bra)","outlook":"Stable","date":"2024-12-01","confidence":0.92,"companyName":"Raízen"}`
        },
        {
          role: 'user',
          content: `EXAMPLE 7 - LATAM (Español):

HTML: "S&P Global Ratings confirmó la calificación crediticia de A+ para Grupo Bimbo con perspectiva estable."
COMPANY: "Grupo Bimbo"
AGENCY: S&P
VALID RATINGS: AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+, BB, BB-, B+, B, B-, CCC+, CCC, CCC-, CC, C, D

Extract:`
        },
        {
          role: 'assistant',
          content: `{"found":true,"rating":"A+","outlook":"Stable","confidence":0.90,"companyName":"Grupo Bimbo"}`
        },
        {
          role: 'user',
          content: `NOW YOUR TURN:

COMPANY: "${companyName}"
AGENCY: ${agency.toUpperCase()}
VALID RATINGS (MUST match EXACTLY): ${RATING_FORMATS[agency]}

HTML:
${cleaned}

STRICT EXTRACTION RULES:
1. Rating MUST be EXACT match from valid list (case-sensitive!)
2. Look for keywords: "Long-Term Rating", "Credit Rating", "IDR", "Issuer Rating", "Senior Unsecured"
3. Outlook: Stable|Positive|Negative|Watch|Developing|N/A
4. Date: YYYY-MM-DD format, only if within last 365 days
5. Confidence scoring:
   - 0.90-1.0: Company name + rating + date + clear context
   - 0.80-0.89: Company name + rating (no date)
   - 0.70-0.79: Rating found, company name fuzzy match
   - <0.70: Too uncertain → set found=false

CRITICAL:
- If rating NOT in valid list → found=false
- If no clear rating → found=false, confidence=0
- If company name completely different → found=false
- Return ONLY JSON (no markdown, no backticks)

Extract:`
        }
      ],
      temperature: 0, // Deterministic
      maxTokens: 512, // Limit response length
    });

    // Parse JSON (handle ```json``` wrapping)
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const object = JSON.parse(cleanedText);

    console.log(`[${agency}] 🤖 LLM result (${provider.name}):`, object);

    // Strict validation
    if (object.found && object.rating) {
      const validRatings = RATING_FORMATS[agency].split(', ');
      if (!validRatings.includes(object.rating)) {
        console.log(`[${agency}] ⚠️ Invalid rating: ${object.rating} not in ${agency} scale`);
        return { found: false, confidence: 0 };
      }

      // Validate date (within 365 days)
      if (object.date) {
        const date = new Date(object.date);
        const now = new Date();
        const maxAge = 365 * 24 * 60 * 60 * 1000;
        const age = now.getTime() - date.getTime();

        if (age < 0 || age > maxAge) {
          console.log(`[${agency}] ⚠️ Date outside 365-day window: ${object.date}`);
          object.date = undefined;
        }
      }

      // Enforce minimum confidence (lowered for maximum sensitivity)
      if (object.confidence < 0.65) {
        console.log(`[${agency}] ⚠️ Confidence too low: ${object.confidence}`);
        return { found: false, confidence: object.confidence };
      }
    }

    return object;

  } catch (error: any) {
    console.error(`[${agency}] ❌ LLM error (${provider.name}):`, error.message);

    if (error.message?.includes('Insufficient Balance') || error.status === 402) {
      console.log(`[${agency}] 💰 ${provider.name} requires credits`);
    }

    return { found: false, confidence: 0 };
  }
}

// Export provider info
export function getLLMProviderInfo() {
  return {
    active: activeProvider,
    available: Object.entries(providers)
      .filter(([_, p]) => p.enabled)
      .map(([name, p]) => ({ name, model: p.model, label: p.name })),
    forced: process.env.LLM_PROVIDER || null,
  };
}
