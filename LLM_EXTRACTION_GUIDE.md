# LLM-Based Credit Score Extraction Guide

## Overview

This document describes the new LLM-based credit score extraction system that replaces the traditional CSS selector-based web scraping approach. The new system uses Large Language Models (LLMs) to intelligently extract credit scores and related information from web pages, making it more robust and adaptable to website changes.

## Key Advantages

### 1. Dynamic Adaptation
- **No hardcoded selectors**: The LLM analyzes page content intelligently
- **Handles layout changes**: Works even when websites update their structure
- **Multi-format support**: Extracts from various formats (tables, text, cards)

### 2. Enhanced Extraction
- **Contextual understanding**: LLM understands relationships between data
- **Multiple data points**: Extracts scores, ratings, outlooks, dates automatically
- **Validation built-in**: LLM validates data consistency during extraction

### 3. Universal Compatibility
- **Any website**: Works with any credit rating website
- **Multiple languages**: Can handle content in different languages
- **Various formats**: Processes HTML, text, and structured data

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   Web Page      │────▶│   Scraper    │────▶│     LLM     │
│   (HTML)        │     │  (Playwright) │     │   (Groq/    │
└─────────────────┘     └──────────────┘     │   Gemini)   │
                                              └─────────────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │  Structured │
                                              │    JSON     │
                                              └─────────────┘
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# LLM Provider Configuration
LLM_PROVIDER=groq              # Options: groq, gemini, openai
GROQ_API_KEY=your_groq_key     # Get from https://console.groq.com
GEMINI_API_KEY=your_gemini_key # Get from https://makersuite.google.com/app/apikey
LLM_MODEL=llama-3.1-70b-versatile
LLM_TEMPERATURE=0.1            # Lower = more consistent
LLM_MAX_TOKENS=4000
LLM_TIMEOUT=30
```

### Getting API Keys

#### Groq (Recommended - Fast & Free)
1. Visit https://console.groq.com
2. Sign up for free account
3. Generate API key
4. Free tier includes 30 requests/minute

#### Google Gemini (Alternative - Generous Free Tier)
1. Visit https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Generate API key
4. Free tier includes 60 requests/minute

## API Usage

### V2 Endpoints

The new LLM-based extraction is available through API v2:

#### 1. Extract from URL

```bash
curl -X POST "http://localhost:8000/api/v2/extract" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.fitchratings.com/entity/petrobras",
    "company_name": "Petrobras S.A."
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "score": 85.0,
    "score_range_min": 0,
    "score_range_max": 100,
    "rating": "BB-",
    "outlook": "stable",
    "last_updated": "2025-01-15",
    "classification": "medium",
    "source": "Fitch Ratings",
    "company_name": "Petrobras S.A.",
    "company_identifier": "33.000.167/0001-01",
    "confidence": 0.95,
    "extraction_notes": null
  },
  "timestamp": "2025-01-20T10:30:00Z"
}
```

#### 2. Multi-Source Extraction

```bash
curl -X POST "http://localhost:8000/api/v2/extract/multi" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Petrobras S.A.",
    "sources": ["fitch", "sp", "moodys"],
    "urls": {
      "fitch": "https://www.fitchratings.com/entity/petrobras",
      "sp": "https://www.spglobal.com/ratings/en/research/petrobras",
      "moodys": "https://www.moodys.com/credit-ratings/Petrobras"
    }
  }'
```

**Response:**
```json
{
  "company": "Petrobras S.A.",
  "scores": {
    "fitch": { /* Credit data */ },
    "sp": { /* Credit data */ },
    "moodys": { /* Credit data */ }
  },
  "summary": {
    "sources_checked": 3,
    "sources_with_data": 3,
    "average_confidence": 0.92,
    "ratings": ["BB-", "BB-", "Ba2"],
    "consensus_outlook": "stable"
  },
  "timestamp": "2025-01-20T10:30:00Z"
}
```

## Python Client Example

```python
import asyncio
import httpx
from typing import Optional

class CreditScoreClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.client = httpx.AsyncClient()

    async def extract_score(self, url: str, company: Optional[str] = None):
        """Extract credit score from a single URL."""
        response = await self.client.post(
            f"{self.base_url}/api/v2/extract",
            json={
                "url": url,
                "company_name": company
            }
        )
        return response.json()

    async def extract_multi_source(self, company: str, urls: dict):
        """Extract from multiple sources."""
        response = await self.client.post(
            f"{self.base_url}/api/v2/extract/multi",
            json={
                "company_name": company,
                "sources": list(urls.keys()),
                "urls": urls
            }
        )
        return response.json()

    async def close(self):
        await self.client.aclose()

# Usage
async def main():
    client = CreditScoreClient()

    # Single extraction
    result = await client.extract_score(
        url="https://www.fitchratings.com/entity/petrobras",
        company="Petrobras"
    )

    if result["success"]:
        data = result["data"]
        print(f"Rating: {data['rating']}")
        print(f"Outlook: {data['outlook']}")
        print(f"Confidence: {data['confidence']}")

    # Multi-source extraction
    multi_result = await client.extract_multi_source(
        company="Petrobras",
        urls={
            "fitch": "https://www.fitchratings.com/entity/petrobras",
            "sp": "https://www.spglobal.com/ratings/petrobras"
        }
    )

    print(f"Average confidence: {multi_result['summary']['average_confidence']}")
    print(f"Consensus outlook: {multi_result['summary']['consensus_outlook']}")

    await client.close()

if __name__ == "__main__":
    asyncio.run(main())
```

## Data Validation

The system includes multiple layers of validation:

### 1. Pydantic Models
- Automatic type checking
- Range validation for scores
- Confidence score validation (0-1)

### 2. LLM Validation
- Cross-references extracted data
- Checks data consistency
- Identifies ambiguities

### 3. Post-Processing
- Normalizes classifications
- Standardizes outlooks
- Validates date formats

## Handling Edge Cases

### Low Confidence Extractions
When confidence < 0.5:
- Error message included in response
- Extraction notes explain issues
- Data still returned for manual review

### Missing Data
- Returns `null` for missing fields
- Does not fail entire extraction
- Notes explain what couldn't be found

### Multiple Scores Found
- LLM identifies primary/current score
- Returns most relevant score
- Notes mention other scores found

## Performance Optimization

### 1. Caching
- Results cached for 7 days (configurable)
- Cache key includes URL and company name
- Reduces API calls and costs

### 2. Concurrent Processing
- Multi-source requests processed in parallel
- Configurable max concurrency
- Rate limiting per domain

### 3. HTML Cleaning
- Removes scripts and styles
- Converts to structured text
- Reduces token usage

## Troubleshooting

### Issue: Low Confidence Scores
**Solution:**
- Provide company name hint
- Use more specific URLs (entity pages)
- Check if page requires authentication

### Issue: Extraction Timeout
**Solution:**
- Increase `LLM_TIMEOUT` setting
- Check internet connection
- Verify API key validity

### Issue: Rate Limiting
**Solution:**
- Reduce `RATE_LIMIT_PER_DOMAIN`
- Implement exponential backoff
- Use caching more aggressively

### Issue: Incorrect Data Extraction
**Solution:**
- Lower `LLM_TEMPERATURE` for consistency
- Provide wait selector for dynamic content
- Check page content manually

## Migration from V1

### Before (V1 - CSS Selectors):
```python
# Hardcoded, brittle selectors
rating = page.select_one(".rating-value").text
outlook = page.select_one(".outlook-label").text
```

### After (V2 - LLM Extraction):
```python
# Intelligent extraction
result = await llm_extractor.extract_from_html(html, url)
rating = result.rating
outlook = result.outlook
```

### Benefits:
- No selector maintenance
- Handles site changes automatically
- Extracts more data points
- Works with any website

## Cost Estimation

### Groq (Llama 3.1 70B)
- **Free Tier**: 30 requests/minute
- **Cost**: $0.59 per million tokens
- **Average extraction**: ~2000 tokens
- **Monthly cost** (1000 extractions): ~$1.20

### Google Gemini (1.5 Flash)
- **Free Tier**: 60 requests/minute, 1M tokens/month free
- **Cost**: $0.075 per million tokens (after free tier)
- **Average extraction**: ~2000 tokens
- **Monthly cost** (1000 extractions): Free (within tier)

## Security Considerations

1. **API Key Protection**
   - Store keys in `.env` file
   - Never commit keys to repository
   - Use environment variables in production

2. **Input Validation**
   - URLs validated before processing
   - Company names sanitized
   - Timeout limits prevent abuse

3. **Output Sanitization**
   - HTML content cleaned before LLM
   - JSON responses validated
   - No executable code in responses

## Future Enhancements

### Planned Features
1. **Historical tracking**: Store and track rating changes
2. **Webhook notifications**: Alert on rating changes
3. **Batch processing**: Process multiple companies efficiently
4. **Custom prompts**: Allow prompt customization per source
5. **Fine-tuning**: Train specific models for better accuracy

### Potential Integrations
1. **Database storage**: PostgreSQL for production
2. **Message queues**: Redis/RabbitMQ for async processing
3. **Monitoring**: Prometheus metrics
4. **API Gateway**: Kong/Traefik for rate limiting

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f api`
2. Review extraction notes in responses
3. Verify API keys are valid
4. Ensure websites are accessible

## Conclusion

The LLM-based extraction system provides a robust, maintainable solution for credit score extraction that adapts to website changes automatically. By leveraging free LLM providers like Groq and Gemini, the system remains cost-effective while delivering high-quality results.