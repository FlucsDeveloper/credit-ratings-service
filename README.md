# Credit Ratings Service

A production-ready microservice for aggregating public credit ratings from **Fitch**, **S&P Global**, and **Moody's**.

## Features

- **Entity Resolution**: Intelligent company name disambiguation across rating agencies
- **Web Scraping**: Robust scraping with Playwright (headless browser)
- **Rating Normalization**: Converts all ratings to comparable scales
- **Caching**: SQLite-based caching with 7-day TTL
- **Rate Limiting**: Token bucket rate limiter with circuit breakers
- **Structured Logging**: JSON logs with contextual information
- **Type Safety**: Full type hints with Pydantic models
- **API Documentation**: Auto-generated OpenAPI/Swagger docs
- **Docker Support**: Production-ready containerization

## Quick Start

### Prerequisites

- Python 3.11+
- Poetry (for local development)
- Docker & Docker Compose (for containerized deployment)

### Local Development

1. **Clone and setup**:
```bash
git clone <repository-url>
cd credit-ratings-service
poetry install
```

2. **Install Playwright browsers**:
```bash
poetry run playwright install chromium
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. **Run the service**:
```bash
poetry run python -m app.main
```

5. **Access the API**:
- Interactive docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health check: http://localhost:8000/api/v1/health

### Docker Deployment

1. **Build and run**:
```bash
docker-compose up -d
```

2. **View logs**:
```bash
docker-compose logs -f api
```

3. **Stop the service**:
```bash
docker-compose down
```

## v1.1: Multi-Agency Credit Ratings API (Production Ready)

### Overview

The `/api/ratings` endpoint (v1.1) provides multi-agency credit ratings with:
- **Multi-agency support**: Moody's, S&P Global, and Fitch
- **SerpAPI web search**: Tier 1-4 search strategy for evidence discovery
- **Deepseek LLM integration**: AI-powered company alias expansion
- **SQLite cache**: 7-day TTL with metrics tracking
- **Truth constraints**: Confidence scoring with validation rules
- **Per-agency status**: `found` | `not_found` | `blocked` (403 detection)
- **Recall ≥80%**: Validated on 10-company QA dataset

### Quick Start (v1.1)

```bash
cd frontend
npm install

# Configure .env.local with required keys
SERPAPI_API_KEY=<your_key>
DEEPSEEK_API_KEY=<your_key>

# Run development
npm run dev

# Run QA tests
npm run qa:recall

# Check metrics
curl http://localhost:3000/api/metrics | jq
```

### Environment Variables (v1.1)

| Variable | Required | Description |
|----------|----------|-------------|
| `SERPAPI_API_KEY` | **Yes** | SerpAPI key for web search |
| `DEEPSEEK_API_KEY` | **Yes** | Deepseek LLM for alias expansion |
| `CACHE_DB_PATH` | No | SQLite cache location (default: ./data/cache.db) |
| `CACHE_TTL_DAYS` | No | Cache TTL in days (default: 7) |

### API Usage (v1.1)

**GET /api/ratings?q=<company>**

Returns credit ratings from all three agencies.

```bash
curl 'http://localhost:3000/api/ratings?q=Microsoft' | jq
```

**Response:**
```json
{
  "agencies": {
    "moodys": {
      "agency": "moodys",
      "status": "found",
      "rating": "Aaa",
      "outlook": "stable",
      "date": "2024-06-15",
      "source_url": "https://ratings.moodys.com/...",
      "confidence": 0.92
    },
    "sp": { "status": "found", "rating": "AAA", "confidence": 0.88, ... },
    "fitch": { "status": "not_found", "rating": null, ... }
  },
  "metadata": {
    "query": "Microsoft",
    "canonical_name": "Microsoft Corporation",
    "aliases": ["Microsoft", "MSFT", ...],
    "searched_at": "2024-10-26T22:30:00Z",
    "latency_ms": 4500,
    "cached": false
  }
}
```

**GET /api/metrics**

Returns cache and performance metrics.

**GET /api/health**

Returns service health status.

### Testing (v1.1)

Run the QA harness against the 10-company dataset:
```bash
npm run qa:recall
```

Expected output:
```
Recall: 85.0% ✅ (target: ≥80%)
Precision: 92.5% ✅ (target: ≥90%)
```

---

## Legacy: API v2 (Vendor APIs + POC Fallback)

### Overview

The legacy `/api/ratings-v2` endpoint provides:
- **Vendor API support** (S&P Capital IQ, Moody's Analytics, Fitch Solutions) when ENV keys configured
- **Heuristic POC fallback** (web search + parsing) when vendor APIs unavailable
- **Entity resolution** with priority: ISIN → LEI → ticker → legal_name → aliases
- **6h caching** with stale-while-revalidate

### Quick Start (Legacy/Frontend)

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables (Legacy)

| Variable | Required | Description |
|----------|----------|-------------|
| `SP_API_KEY` | Optional | S&P Capital IQ API key |
| `SP_BASE_URL` | Optional | S&P API base URL (default: https://api.capitaliq.com) |
| `MOODYS_API_KEY` | Optional | Moody's Analytics API key |
| `MOODYS_BASE_URL` | Optional | Moody's API base URL |
| `FITCH_API_KEY` | Optional | Fitch Solutions API key |
| `FITCH_BASE_URL` | Optional | Fitch API base URL |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Required | Google Gemini API for LLM entity resolution |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek (free) for rating extraction from HTML |
| `FINANCIAL_MODELING_PREP_API_KEY` | Optional | FMP for ticker/ISIN lookup |
| `ALPHA_VANTAGE_API_KEY` | Optional | Alpha Vantage for ticker lookup |
| `OPENFIGI_API_KEY` | Optional | OpenFIGI for ISIN lookup |
| `USER_AGENT` | Optional | User agent for web requests |

**Note**: If vendor API keys are not set, the system automatically falls back to heuristic mode (web search + parsing).

### API v2 Endpoints

#### GET /api/ratings-v2?q=<query>

**Query ANY company** by name, ticker, ISIN, or LEI.

**Examples**:
```bash
# By name
curl "http://localhost:3000/api/ratings-v2?q=Apple%20Inc."

# By ticker
curl "http://localhost:3000/api/ratings-v2?q=AAPL"

# By ISIN
curl "http://localhost:3000/api/ratings-v2?q=US0378331005"

# By LEI
curl "http://localhost:3000/api/ratings-v2?q=HWUPKR0MPOU8FGXBT394"
```

**Response**:
```json
{
  "query": "Apple Inc.",
  "entity": {
    "legal_name": "Apple Inc",
    "ticker": "AAPL",
    "isin": "US0378331005",
    "lei": "HWUPKR0MPOU8FGXBT394",
    "country": "USA"
  },
  "ratings": [
    {
      "agency": "S&P Global",
      "rating": "AA+",
      "outlook": "Stable",
      "date": "2024-09-15",
      "scale": "S&P/Fitch",
      "source_ref": "https://www.spglobal.com/ratings/..."
    },
    {
      "agency": "Fitch",
      "rating": "AA+",
      "outlook": "Stable",
      "date": "2024-08-22",
      "scale": "S&P/Fitch",
      "source_ref": "https://www.fitchratings.com/..."
    },
    {
      "agency": "Moody's",
      "rating": "Aa1",
      "outlook": "Stable",
      "date": "2024-07-10",
      "scale": "Moody's",
      "source_ref": "https://www.moodys.com/..."
    }
  ],
  "summary": {
    "agenciesFound": 3,
    "averageScore": 20.0,
    "category": "Investment Grade"
  },
  "meta": {
    "lastUpdated": "2025-10-24T22:00:00.000Z",
    "sourcePriority": [
      "S&P Capital IQ API",
      "Fitch Solutions API",
      "Moodys Analytics API"
    ],
    "traceId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### OPTIONS /api/ratings-v2

Get cache statistics:
```bash
curl -X OPTIONS "http://localhost:3000/api/ratings-v2"
```

### Rating Normalization (v2)

Ratings are normalized to an **ordinal scale 1-21** (AAA/Aaa=21, D/C=1):

| S&P/Fitch | Moody's | Ordinal | Category |
|-----------|---------|---------|----------|
| AAA | Aaa | 21 | Investment Grade |
| AA+ | Aa1 | 20 | Investment Grade |
| BBB- | Baa3 | 12 | Investment Grade |
| BB+ | Ba1 | 11 | Speculative |
| D | C | 1 | Speculative |

**Average Score**: Mean of all agency ordinals (e.g., AA+/Aa1/AA+ = 20.0)
**Category**: Investment Grade if avg ≥ 12, else Speculative

### Smoke Tests

Run the spec-mandated smoke tests:

```bash
# Test 1: Apple Inc. (name)
curl -s "http://localhost:3000/api/ratings-v2?q=Apple%20Inc."

# Test 2: AAPL (ticker)
curl -s "http://localhost:3000/api/ratings-v2?q=AAPL"

# Test 3: Microsoft
curl -s "http://localhost:3000/api/ratings-v2?q=MSFT"

# Test 4: Petrobras
curl -s "http://localhost:3000/api/ratings-v2?q=Petrobras"

# Test 5: Private company (0/3 expected)
curl -s "http://localhost:3000/api/ratings-v2?q=Private%20Holdings%20LLC"
```

### Limitations & POC Mode

**Heuristic Fallback (POC)**:
- Uses DuckDuckGo HTML search + Cheerio parsing
- Rate-limited to 1 req/sec per site
- Confidence scores: high (>70%), medium (50-70%), low (<50%)
- **FOR TESTING ONLY** - respect site ToS & robots.txt
- May return 0/3 agencies due to anti-bot measures

**Production Mode**:
- Set vendor API keys to use official S&P/Fitch/Moody's APIs
- Much higher reliability and freshness
- Proper authentication & rate limits
- Legal compliance guaranteed

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH` | 401 | Vendor API authentication failed |
| `RATE_LIMIT` | 429 | Vendor API rate limit exceeded |
| `NOT_FOUND` | 404 | Entity not found |
| `STALE` | 422 | Rating older than 450 days |
| `PARSING` | 422 | Validation failed (bad rating/outlook) |
| `TIMEOUT` | 504 | Request timed out (>30s per agency) |
| `CIRCUIT_BREAKER_OPEN` | 503 | Too many recent failures (5 in 60s) |

### Observability

Every request logs:
```
[API] TraceId: 550e8400-e29b-41d4-a716-446655440000
[API] Query: "Apple Inc."
[API] STEP 1: Resolving entity...
[API] ✅ Resolved to: Apple Inc (AAPL) in 1234ms
[API] STEP 2: Check Cache...
[API] ⚠️ Cache MISS
[API] STEP 3: Fetching ratings from agencies (parallel)...
[API] S&P completed in 2341ms
[API] Fitch completed in 2156ms
[API] Moodys completed in 2789ms
[API] ✅ S&P: AA+ (Stable)
[API] ✅ Fitch: AA+ (Stable)
[API] ✅ Moodys: Aa1 (Stable)
[API] STEP 5: Validating ratings...
[API] ✅ Validation passed for 3 ratings
[API] Agencies found: 3/3
[API] Average score: 20.0
[API] Category: Investment Grade
[API] Processing completed in 5789ms
```

---

## API Usage (Legacy Python Backend)

### Get Ratings

**Endpoint**: `POST /api/v1/ratings`

**Request**:
```json
{
  "company_name": "Petrobras S.A.",
  "country": "BR",
  "prefer_exact_match": true
}
```

**Response**:
```json
{
  "query": "Petrobras S.A.",
  "resolved": {
    "name": "Petrobras S.A.",
    "country": "BR",
    "canonical_url": "https://www.fitchratings.com/entity/petrobras",
    "confidence": 0.95,
    "ambiguous_candidates": []
  },
  "ratings": {
    "fitch": {
      "raw": "BB-",
      "outlook": "Stable",
      "normalized": {
        "scale": "S&P/Fitch",
        "score": 13,
        "bucket": "Speculative"
      },
      "last_updated": "2025-09-15T00:00:00Z",
      "source_url": "https://www.fitchratings.com/...",
      "blocked": false,
      "error": null
    },
    "sp": {
      "raw": "BB-",
      "outlook": "Stable",
      "normalized": {
        "scale": "S&P/Fitch",
        "score": 13,
        "bucket": "Speculative"
      },
      "last_updated": "2025-08-22T00:00:00Z",
      "source_url": "https://www.spglobal.com/...",
      "blocked": false,
      "error": null
    },
    "moodys": {
      "raw": "Ba2",
      "outlook": "Positive",
      "normalized": {
        "scale": "Moody's",
        "score": 12,
        "bucket": "Speculative"
      },
      "last_updated": "2025-07-10T00:00:00Z",
      "source_url": "https://www.moodys.com/...",
      "blocked": false,
      "error": null
    }
  },
  "notes": [],
  "timestamp": "2025-10-24T21:00:00Z",
  "cached": false
}
```

## Architecture

```
credit-ratings-service/
├── app/
│   ├── api/              # FastAPI routes
│   ├── core/             # Configuration, logging
│   ├── models/           # Pydantic schemas, enums
│   ├── scrapers/         # Agency-specific scrapers
│   │   ├── base.py       # Base scraper class
│   │   ├── fitch.py      # Fitch scraper
│   │   ├── sp.py         # S&P scraper
│   │   └── moodys.py     # Moody's scraper
│   ├── services/         # Business logic
│   │   ├── cache.py      # SQLite cache
│   │   ├── entity_resolver.py
│   │   ├── rate_limiter.py
│   │   └── ratings_service.py
│   ├── utils/            # Helpers
│   │   └── rating_normalizer.py
│   └── main.py           # Application entry point
├── tests/
│   └── unit/             # Unit tests
├── Dockerfile
├── docker-compose.yml
└── pyproject.toml
```

## Rating Normalization

### Scales

**Fitch/S&P Scale**:
- Investment Grade: AAA to BBB- (scores 1-10)
- Speculative: BB+ to C (scores 11-19)
- Default: D (score 21)

**Moody's Scale**:
- Investment Grade: Aaa to Baa3 (scores 1-10)
- Speculative: Ba1 to C (scores 11-19)

### Cross-Scale Conversion

The service automatically converts between scales:

| Fitch/S&P | Moody's | Score | Bucket |
|-----------|---------|-------|--------|
| AAA | Aaa | 1 | Investment Grade |
| AA+ | Aa1 | 2 | Investment Grade |
| BBB- | Baa3 | 10 | Investment Grade |
| BB+ | Ba1 | 11 | Speculative |
| D | - | 21 | Default |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | 0.0.0.0 | Server host |
| `PORT` | 8000 | Server port |
| `LOG_LEVEL` | INFO | Logging level |
| `HEADLESS` | true | Run browser headless |
| `MAX_CONCURRENCY` | 2 | Max concurrent scraping |
| `SCRAPING_ALLOWED_FITCH` | true | Enable Fitch scraping |
| `SCRAPING_ALLOWED_SP` | true | Enable S&P scraping |
| `SCRAPING_ALLOWED_MOODYS` | true | Enable Moody's scraping |
| `CACHE_TTL_DAYS` | 7 | Cache retention days |
| `CACHE_DB_PATH` | ./data/cache.db | SQLite cache path |
| `RATE_LIMIT_PER_DOMAIN` | 10 | Requests per window |
| `RATE_LIMIT_WINDOW_SECONDS` | 60 | Rate limit window |
| `CIRCUIT_BREAKER_THRESHOLD` | 5 | Failures before circuit opens |
| `CIRCUIT_BREAKER_TIMEOUT_SECONDS` | 300 | Circuit open duration |

## Testing

Run unit tests:
```bash
poetry run pytest
```

With coverage:
```bash
poetry run pytest --cov=app --cov-report=html
```

## Compliance & Ethics

This service:
- ✅ Respects `robots.txt`
- ✅ Uses public, non-authenticated pages only
- ✅ Implements rate limiting to avoid overload
- ✅ Does NOT bypass paywalls or authentication
- ✅ Transparently marks blocked requests (`blocked: true`)
- ✅ Follows agency Terms of Service

**Important**: This is a prototype for demonstration. For production use:
1. Consider official rating agency APIs (if available/licensed)
2. Review Terms of Service for each agency
3. Implement additional anti-detection measures if needed
4. Monitor for changes in page structure

## Limitations

1. **Page Structure Changes**: Agency websites may change layout, breaking selectors
2. **Paywalls**: Some content may be behind authentication/paywalls
3. **Anti-Bot Measures**: Aggressive rate limiting or blocking may occur
4. **Disambiguation**: Company names with multiple entities may require manual selection
5. **Data Freshness**: Ratings are cached for 7 days (configurable)

## Troubleshooting

### Scraping Blocked

If you see `blocked: true` in responses:
1. Check rate limiting settings (reduce `RATE_LIMIT_PER_DOMAIN`)
2. Verify agency permission flags in `.env`
3. Check circuit breaker status (logs show "circuit_opened")
4. Wait for circuit breaker timeout (default 5 minutes)

### Entity Resolution Fails

If `confidence` is low:
1. Try with explicit country code
2. Use exact legal name (check agency websites manually)
3. Check `ambiguous_candidates` for alternatives
4. Review search query in logs

### Performance Issues

1. Reduce `MAX_CONCURRENCY` (default 2)
2. Increase `REQUEST_TIMEOUT` for slow networks
3. Check cache hit rate in logs
4. Enable cache cleanup on startup

## Roadmap

- [ ] Historical rating actions
- [ ] CSV/Excel export
- [ ] Webhook notifications on rating changes
- [ ] PostgreSQL cache backend
- [ ] Prometheus metrics
- [ ] GraphQL API
- [ ] Official API integrations (when licensed)

## License

MIT License - See LICENSE file

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests and linting: `poetry run pytest && poetry run ruff check`
4. Submit a pull request

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: See `/docs` endpoint when running

---

**Disclaimer**: This service is for educational/research purposes. Users are responsible for compliance with rating agency Terms of Service and applicable laws.
