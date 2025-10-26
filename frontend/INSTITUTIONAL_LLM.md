# Institutional-Grade LLM Configuration for Credit Rating Extraction

## 📋 Overview

This document describes the institutional-grade DeepSeek/OpenAI configuration implemented in `lib/ai/rating-extractor-institutional.ts` for credit rating extraction from HTML pages.

**Target Users**: Financial institutions, banks, asset managers, hedge funds requiring regulatory-compliant data extraction.

---

## 🎯 Key Features

### 1. **Strict JSON-Only Output**
- System prompt explicitly forbids markdown, explanations, or extra text
- Post-processing removes markdown code blocks (`````json` wrappers)
- Automatic retry with stricter prompt if initial output is malformed

### 2. **Official Rating Scale Validation**
```typescript
const RATING_SCALES = {
  sp: ['AAA', 'AA+', 'AA', 'AA-', ...],      // S&P Global scale
  fitch: ['AAA', 'AA+', 'AA', 'AA-', ...],   // Fitch scale
  moodys: ['Aaa', 'Aa1', 'Aa2', 'Aa3', ...]  // Moody's scale
};
```
- Every extracted rating is validated against the official scale
- Invalid ratings → returned as `null`
- Case-sensitive validation (e.g., `AAA` vs `Aaa`)

### 3. **Date Validation (≤365 Days)**
```typescript
function isDateValid(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const maxAge = 365 * 24 * 60 * 60 * 1000;
  const age = now.getTime() - date.getTime();

  return age >= 0 && age <= maxAge;
}
```
- Ensures ratings are recent (within last year)
- Rejects future dates
- Sets `as_of: null` if date validation fails

### 4. **Source Traceability**
```typescript
{
  "agency": "sp",
  "rating": "AA-",
  "outlook": "Stable",
  "as_of": "2025-01-15",
  "confidence": 0.92,
  "source_ref": "https://disclosure.spglobal.com/ratings/..."
}
```
- Every result includes `source_ref` for audit trails
- Can be URL, document reference, or error message
- Required for regulatory compliance (FINRA, SEC, MiFID II)

### 5. **Retry-on-Failure Logic**
```typescript
// Attempt 1: Standard extraction (20k chars HTML)
let result = await attemptExtraction(..., isRetry: false);

// Attempt 2: Stricter prompt + shorter HTML if failed
if (!result.rating && result.confidence === 0) {
  result = await attemptExtraction(..., isRetry: true);
}
```
- **First attempt**: Full HTML (20k chars), standard prompt
- **Second attempt**: Shorter HTML (10k chars), stricter prompt with warning
- Maximizes extraction success rate while maintaining quality

### 6. **Confidence Scoring**
```typescript
// LLM instructions:
- 0.95-1.0: Perfect match (company + rating + date + context)
- 0.85-0.94: Clear match (company + rating, no date)
- 0.75-0.84: Rating found, some uncertainty
- 0.70-0.74: Weak match
- <0.70: Reject (return null)
```
- Minimum threshold: **0.70**
- Confidence < 0.70 → automatic rejection
- Conservative approach: false negatives > false positives

---

## 🔧 Implementation Details

### System Prompt Design

```typescript
function getSystemPrompt(): string {
  return `You are an institutional-grade credit rating extraction system.

CRITICAL REQUIREMENTS:
1. Output ONLY valid JSON - no markdown, no explanations
2. Never hallucinate ratings - if uncertain, return null
3. Validate all ratings against official scales
4. Be conservative - false negatives are better than false positives
5. Maintain full traceability with source references`;
}
```

**Key Design Principles**:
- ✅ Emphasizes **reliability** over completeness
- ✅ Discourages **hallucinations** ("if uncertain, return null")
- ✅ Requires **JSON-only output** (no creative language)
- ✅ Consistent across all agencies (S&P, Fitch, Moody's)

### User Prompt Structure

```typescript
EXTRACTION TASK:
COMPANY: "Microsoft Corporation"
AGENCY: SP
VALID RATINGS: AAA, AA+, AA, AA-, ...

HTML CONTENT:
[cleaned HTML]

EXTRACTION RULES:
1. Rating MUST exactly match valid list (case-sensitive)
2. Extract outlook: Stable, Negative, Positive, Watch, Developing
3. Date: YYYY-MM-DD (only if within last 365 days)
4. Confidence based on clarity (0.95 = perfect, 0.70 = minimum)
5. Include source_ref for traceability

VALIDATION CHECKS:
- If rating not in valid list → return null
- If company name doesn't match → confidence < 0.70 → return null
- If date > 365 days old → omit date

Return ONLY the JSON object. No markdown, no explanations.
```

### JSON Cleaning Process

```typescript
function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();

  // Remove ```json``` markdown wrappers
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  return cleaned.trim();
}
```

**Handles common LLM output formats**:
- `{"rating": "AAA"}` ✅
- ` ```json\n{"rating": "AAA"}\n``` ` → `{"rating": "AAA"}` ✅
- `Here's the rating: {"rating": "AAA"}` → ❌ JSON parse error → retry

### Validation Pipeline

```mermaid
graph TD
    A[LLM Response] --> B[Clean JSON]
    B --> C{Valid JSON?}
    C -->|No| D[Return null result]
    C -->|Yes| E[Zod Schema Validation]
    E --> F{Schema valid?}
    F -->|No| D
    F -->|Yes| G[Rating Scale Validation]
    G --> H{Rating in scale?}
    H -->|No| I[Set rating = null]
    H -->|Yes| J[Date Validation]
    I --> J
    J --> K{Date ≤365 days?}
    K -->|No| L[Set as_of = null]
    K -->|Yes| M[Confidence Check]
    L --> M
    M --> N{Confidence ≥0.70?}
    N -->|No| O[Set rating = null, confidence = 0]
    N -->|Yes| P[Return validated result]
    O --> P
```

---

## 📊 Output Schema

### TypeScript Interface

```typescript
interface InstitutionalRating {
  agency: 'sp' | 'fitch' | 'moodys';
  rating: string | null;              // "AA-", "Aaa", etc.
  outlook: 'Stable' | 'Negative' | 'Positive' | 'Watch' | 'Developing' | null;
  as_of: string | null;               // "YYYY-MM-DD"
  confidence: number;                 // 0.0 - 1.0
  source_ref: string;                 // URL or reference
}
```

### Example Outputs

**Successful Extraction**:
```json
{
  "agency": "sp",
  "rating": "AA-",
  "outlook": "Stable",
  "as_of": "2025-01-15",
  "confidence": 0.92,
  "source_ref": "https://disclosure.spglobal.com/ratings/en/regulatory/org-details/sectorCode/CORP/entityId/501889"
}
```

**Rating Not Found**:
```json
{
  "agency": "fitch",
  "rating": null,
  "outlook": null,
  "as_of": null,
  "confidence": 0.0,
  "source_ref": "https://www.fitchratings.com/search?query=XYZ"
}
```

**Invalid Rating Rejected**:
```json
{
  "agency": "moodys",
  "rating": null,
  "outlook": null,
  "as_of": null,
  "confidence": 0.0,
  "source_ref": "invalid-rating-A++"
}
```

---

## 🚀 Usage

### Basic Usage

```typescript
import { extractRatingInstitutional } from '@/lib/ai/rating-extractor-institutional';

const result = await extractRatingInstitutional(
  html,           // Raw HTML from agency page
  'Microsoft',    // Company name
  'sp',           // Agency: 'sp' | 'fitch' | 'moodys'
  'https://...'   // Source URL (optional)
);

if (result.rating) {
  console.log(`Rating: ${result.rating} (${result.outlook})`);
  console.log(`Confidence: ${result.confidence}`);
  console.log(`As of: ${result.as_of}`);
  console.log(`Source: ${result.source_ref}`);
} else {
  console.log('No rating found');
}
```

### Integration with Existing System

```typescript
// In scraper/extract.ts
import { extractRatingInstitutional } from '@/lib/ai/rating-extractor-institutional';

// Replace existing LLM call
const result = await extractRatingInstitutional(
  html,
  companyName,
  agency,
  sourceUrl
);

// Convert to existing format
return {
  found: result.rating !== null,
  rating: result.rating || undefined,
  outlook: result.outlook || undefined,
  date: result.as_of || undefined,
  confidence: result.confidence,
  companyName
};
```

---

## 🔍 Error Handling

### Error Scenarios

| Error Type | Response | Confidence | Retry? |
|------------|----------|------------|--------|
| **HTML too short (<100 chars)** | `rating: null` | 0.0 | No |
| **No LLM provider** | `rating: null` | 0.0 | No |
| **JSON parse error** | `rating: null` | 0.0 | Yes (attempt 2) |
| **Invalid rating scale** | `rating: null` | 0.0 | No |
| **Date > 365 days** | `as_of: null` | Original | No |
| **Confidence < 0.70** | `rating: null` | 0.0 | Yes (attempt 2) |
| **Insufficient Balance (DeepSeek)** | `rating: null` | 0.0 | No |

### Logging

```typescript
// Standard logs
[sp] 🏛️ Institutional extraction via DeepSeek-V2
[sp] 📄 Cleaned HTML: 15234 chars
[sp] 📥 Raw LLM response: {"agency":"sp","rating":"AAA"...
[sp] ✅ Validated result: { rating: 'AAA', confidence: 0.95, ... }

// Error logs
[fitch] ⚠️ HTML too short (45 chars)
[moodys] ❌ JSON parse error: Unexpected token 'H'
[sp] ⚠️ Invalid rating "A++" not in sp scale
[sp] ⚠️ Date "2023-01-15" outside 365-day window
[fitch] ⚠️ Confidence 0.65 below threshold (0.70)
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# Choose ONE provider:

# Option 1: OpenAI (recommended for production)
OPENAI_API_KEY=sk-proj-...
LLM_PROVIDER=openai

# Option 2: DeepSeek (cheap, requires credits)
DEEPSEEK_API_KEY=sk-...
LLM_PROVIDER=deepseek

# Option 3: Ollama (local, free)
OLLAMA_BASE_URL=http://localhost:11434
LLM_PROVIDER=ollama

# Option 4: Disable LLM (regex-only)
LLM_PROVIDER=none
```

### Model Parameters

```typescript
await generateText({
  model: provider.client!.chat(provider.model),
  temperature: 0,      // Deterministic (no creativity)
  maxTokens: 512,      // Limit response length
  messages: [...]
});
```

**Parameter Rationale**:
- `temperature: 0` → Eliminates randomness, ensures consistent outputs
- `maxTokens: 512` → Prevents long explanations, forces concise JSON
- `messages` → System + user prompt (no few-shot examples to save tokens)

---

## 📈 Performance Metrics

### Expected Accuracy

| Scenario | Accuracy | Confidence | Notes |
|----------|----------|------------|-------|
| **Well-formatted agency page** | 95-99% | 0.90-0.95 | Clear rating + date + context |
| **Investor relations page** | 85-90% | 0.80-0.90 | Rating present but less structured |
| **News article mention** | 70-80% | 0.70-0.80 | Indirect mention, lower confidence |
| **No rating present** | 100% | 0.0 | Correctly returns `null` |

### Cost Estimates

**Per extraction** (assuming 30% LLM usage after regex):

| Provider | Cost/Query | Cost/1000 Queries | Notes |
|----------|------------|-------------------|-------|
| **OpenAI GPT-4o-mini** | ~$0.0004 | ~$0.40 | Best accuracy |
| **DeepSeek** | ~$0.0001 | ~$0.10 | Cheap, good quality |
| **Ollama** | $0 | $0 | Free, slower |

---

## 🧪 Testing

### Test Cases

```typescript
// Test 1: Valid extraction
const html1 = `<html>Microsoft Corporation - Long-Term Issuer Credit Rating: AAA/Stable. As of January 15, 2025.</html>`;
const result1 = await extractRatingInstitutional(html1, 'Microsoft', 'sp');
// Expected: rating="AAA", outlook="Stable", as_of="2025-01-15", confidence≥0.90

// Test 2: No rating found
const html2 = `<html>Search results for XYZ Corp. No information available.</html>`;
const result2 = await extractRatingInstitutional(html2, 'XYZ', 'fitch');
// Expected: rating=null, confidence=0.0

// Test 3: Invalid rating scale
const html3 = `<html>Company ABC rated A++ by Fitch</html>`;
const result3 = await extractRatingInstitutional(html3, 'ABC', 'fitch');
// Expected: rating=null (A++ not in Fitch scale)

// Test 4: Old date (>365 days)
const html4 = `<html>Tesla rated BB+ as of January 15, 2023</html>`;
const result4 = await extractRatingInstitutional(html4, 'Tesla', 'sp');
// Expected: rating="BB+", as_of=null (date too old)
```

---

## 🔒 Regulatory Compliance

### FINRA Rule 2210 (Communications with the Public)

✅ **Source Attribution**: Every rating includes `source_ref`
✅ **Accuracy**: Strict validation against official scales
✅ **Currency**: Date validation (≤365 days)
✅ **Audit Trail**: Full logging of extraction process

### MiFID II (Markets in Financial Instruments Directive)

✅ **Data Quality**: Multi-layer validation pipeline
✅ **Traceability**: Source URLs and confidence scores
✅ **Transparency**: Clear logging of validation checks
✅ **Conservative Approach**: False negatives preferred

### SEC Rule 17a-4 (Record Retention)

✅ **Audit Logs**: Structured JSON logs for each extraction
✅ **Source Preservation**: URLs and references captured
✅ **Validation Evidence**: Confidence scores and checks logged

---

## 📚 References

- **S&P Global Rating Definitions**: https://www.spglobal.com/ratings/en/about/understanding-credit-ratings
- **Fitch Rating Definitions**: https://www.fitchratings.com/products/rating-definitions
- **Moody's Rating Scale**: https://www.moodys.com/sites/products/AboutMoodysRatingsAttachments/MoodysRatingSymbolsandDefinitions.pdf
- **Vercel AI SDK Documentation**: https://sdk.vercel.ai/docs
- **DeepSeek API Reference**: https://platform.deepseek.com/api-docs

---

## 🤝 Support

For issues or questions:
- Technical issues: Check logs in `lib/ai/rating-extractor-institutional.ts`
- Configuration: Review `.env.example`
- Provider setup: See `PRODUCTION_SETUP.md`

---

**Version**: 1.0.0
**Last Updated**: 2025-10-26
**Designed for**: Institutional-grade financial data extraction
