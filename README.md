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

## API Usage

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
