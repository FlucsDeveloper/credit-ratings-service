# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Application                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP POST /api/v1/ratings
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                         FastAPI Application                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      API Layer (routes.py)                 │  │
│  └─────────────────────────────┬─────────────────────────────┘  │
│                                │                                 │
│  ┌─────────────────────────────▼─────────────────────────────┐  │
│  │             RatingsService (Orchestrator)                  │  │
│  │  • Coordinates entity resolution                           │  │
│  │  • Manages scraping tasks                                  │  │
│  │  • Aggregates results                                      │  │
│  └──┬────────────┬────────────┬──────────────┬────────────────┘  │
│     │            │            │              │                    │
│  ┌──▼──────┐ ┌──▼──────┐  ┌──▼──────┐   ┌───▼────────┐          │
│  │  Cache  │ │ Entity  │  │  Rate   │   │  Scrapers  │          │
│  │ Service │ │Resolver │  │ Limiter │   │  (3 types) │          │
│  └─────────┘ └─────────┘  └─────────┘   └────────────┘          │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Web Requests
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
    ┌───▼────┐             ┌───▼────┐             ┌───▼────┐
    │ Fitch  │             │  S&P   │             │Moody's │
    │Ratings │             │ Global │             │Ratings │
    └────────┘             └────────┘             └────────┘
```

## Component Breakdown

### 1. API Layer (`app/api/`)

**Purpose**: HTTP request/response handling

**Files**:
- `routes.py`: Endpoint definitions

**Responsibilities**:
- Request validation (Pydantic)
- Error handling
- Response formatting
- OpenAPI documentation

### 2. Services Layer (`app/services/`)

#### RatingsService (`ratings_service.py`)
**Purpose**: Main orchestrator

**Flow**:
1. Check cache
2. Resolve entities (parallel)
3. Scrape ratings (parallel)
4. Aggregate results
5. Store in cache

#### EntityResolver (`entity_resolver.py`)
**Purpose**: Company name disambiguation

**Strategy**:
- Google dork searches (site:fitchratings.com)
- Confidence scoring
- Fuzzy name matching
- Country validation

#### CacheService (`cache.py`)
**Purpose**: SQLite-based caching

**Features**:
- 7-day TTL (configurable)
- Automatic cleanup
- Cache key normalization
- Async operations

#### RateLimiter (`rate_limiter.py`)
**Purpose**: Token bucket + circuit breaker

**Features**:
- Per-domain rate limiting
- Circuit breaker pattern
- Exponential backoff
- Failure tracking

### 3. Scrapers Layer (`app/scrapers/`)

#### BaseScraper (`base.py`)
**Purpose**: Common scraping logic

**Features**:
- Playwright browser management
- Retry logic (tenacity)
- User-agent rotation
- Rate limit integration
- Error handling

#### Agency-Specific Scrapers
- `fitch.py`: Fitch Ratings scraper
- `sp.py`: S&P Global scraper
- `moodys.py`: Moody's scraper

**Each implements**:
- Multi-strategy extraction (selectors + regex)
- Outlook detection
- Date parsing
- Rating normalization integration

### 4. Models Layer (`app/models/`)

#### Enums (`enums.py`)
- `RatingAgency`: FITCH, SP, MOODYS
- `RatingScale`: Fitch/SP vs Moody's
- `RatingBucket`: Investment Grade, Speculative, Default
- `Outlook`: Positive, Stable, Negative, etc.

#### Schemas (`schemas.py`)
- `RatingRequest`: API input
- `RatingsResponse`: API output
- `AgencyRating`: Single agency rating
- `ResolvedEntity`: Disambiguated company
- `NormalizedRating`: Standardized rating

### 5. Utils Layer (`app/utils/`)

#### RatingNormalizer (`rating_normalizer.py`)
**Purpose**: Convert ratings between scales

**Mappings**:
- Fitch/S&P: AAA to D (21 levels)
- Moody's: Aaa to C (19 levels)
- Cross-conversion functions
- Investment grade detection

### 6. Core Layer (`app/core/`)

#### Config (`config.py`)
- Pydantic Settings
- Environment variable loading
- Type-safe configuration

#### Logging (`logging.py`)
- Structured JSON logs (structlog)
- Contextual logging
- Log level management

## Data Flow

### Request Flow (Detailed)

```
1. Client Request
   POST /api/v1/ratings
   { "company_name": "Petrobras", "country": "BR" }

2. API Layer (routes.py)
   ├─ Validate request (Pydantic)
   └─ Call RatingsService.get_ratings()

3. RatingsService
   ├─ Check cache
   │  ├─ HIT → Return cached response
   │  └─ MISS → Continue
   │
   ├─ Resolve entities (parallel)
   │  ├─ EntityResolver.resolve(company, "BR", FITCH)
   │  ├─ EntityResolver.resolve(company, "BR", SP)
   │  └─ EntityResolver.resolve(company, "BR", MOODYS)
   │     └─ For each:
   │        ├─ Build search query
   │        ├─ Fetch search results (DuckDuckGo)
   │        ├─ Score candidates
   │        └─ Return best match + confidence
   │
   ├─ Scrape ratings (parallel)
   │  ├─ FitchScraper.scrape(resolved_url)
   │  ├─ SPScraper.scrape(resolved_url)
   │  └─ MoodysScraper.scrape(resolved_url)
   │     └─ For each:
   │        ├─ Check rate limit
   │        ├─ Fetch page (Playwright)
   │        ├─ Extract rating (selectors + regex)
   │        ├─ Extract outlook
   │        ├─ Extract date
   │        ├─ Normalize rating
   │        └─ Return AgencyRating
   │
   ├─ Aggregate results
   ├─ Generate notes
   └─ Store in cache

4. API Layer
   ├─ Serialize to JSON
   └─ Return HTTP 200
```

## Concurrency Model

### Parallel Operations

1. **Entity Resolution** (3 concurrent tasks)
   - One per agency
   - Independent searches
   - Best result selected after all complete

2. **Rating Scraping** (up to 3 concurrent tasks)
   - One per successfully resolved entity
   - Rate limited per domain
   - Circuit breaker protects against failures

### Rate Limiting

```
┌─────────────────────────────────────────┐
│         RateLimiter (Token Bucket)       │
├─────────────────────────────────────────┤
│  Domain: fitchratings.com               │
│  ├─ Tokens: 10/10                       │
│  ├─ Window: 60s                         │
│  └─ Circuit: CLOSED                     │
├─────────────────────────────────────────┤
│  Domain: spglobal.com                   │
│  ├─ Tokens: 8/10                        │
│  ├─ Window: 60s                         │
│  └─ Circuit: CLOSED                     │
├─────────────────────────────────────────┤
│  Domain: moodys.com                     │
│  ├─ Tokens: 0/10                        │
│  ├─ Window: 60s (45s remaining)         │
│  └─ Circuit: OPEN (3 failures)          │
└─────────────────────────────────────────┘
```

### Circuit Breaker States

```
           ┌──────────┐
           │  CLOSED  │ (Normal operation)
           └────┬─────┘
                │ 5 failures
                ▼
           ┌──────────┐
           │   OPEN   │ (Blocking requests)
           └────┬─────┘
                │ 5 min timeout
                ▼
           ┌──────────┐
      ┌───│HALF_OPEN │ (Testing recovery)
      │   └────┬─────┘
      │        │ 2 successes
      │        ▼
      │   [Close circuit]
      │
      └─ [Failure → Open circuit]
```

## Error Handling Strategy

### Levels of Resilience

1. **Request Level** (routes.py)
   - HTTP status codes
   - User-friendly error messages
   - Logging

2. **Service Level** (ratings_service.py)
   - Try/catch per agency
   - Partial results returned
   - Notes field for warnings

3. **Scraper Level** (scrapers/base.py)
   - Retry logic (3 attempts)
   - Exponential backoff
   - Fallback strategies (multiple selectors)

4. **Network Level** (rate_limiter.py)
   - Rate limiting
   - Circuit breaker
   - Failure tracking

### Example Error Scenarios

| Scenario | Handling |
|----------|----------|
| Agency website down | Circuit breaker opens, returns `error: "Scraping failed"` |
| Wrong company name | Low confidence score, returns `ambiguous_candidates` |
| Rate limit hit | Returns `blocked: true, error: "Rate limit exceeded"` |
| Page structure changed | Regex fallback, or `error: "Could not extract rating"` |
| Network timeout | Retry 3x with backoff, then fail gracefully |

## Scalability Considerations

### Current Limitations

- **Single instance**: No distributed locking for rate limits
- **SQLite cache**: Not suitable for multi-instance deployments
- **In-memory circuit breaker**: State lost on restart

### Scaling Solutions

1. **Horizontal Scaling**
   - Replace SQLite with PostgreSQL/Redis
   - Distributed rate limiting (Redis)
   - Shared circuit breaker state

2. **Queue-Based Architecture**
   - RabbitMQ/SQS for async processing
   - Worker pool for scraping
   - Webhook notifications

3. **Caching Layer**
   - Redis for cache (instead of SQLite)
   - CDN for static responses
   - Cache warming strategies

## Performance Characteristics

### Typical Response Times

| Scenario | Time | Notes |
|----------|------|-------|
| Cache hit | 10-50ms | Database lookup only |
| Cache miss (all succeed) | 15-45s | 3 agencies × 10-15s each (parallel) |
| Cache miss (some blocked) | 5-20s | Partial results faster |
| Entity resolution only | 2-5s | Search queries only |

### Resource Usage

- **Memory**: ~200MB base + ~150MB per concurrent scraping task
- **CPU**: Low (mostly I/O bound)
- **Disk**: Cache grows ~10KB per company
- **Network**: ~5MB per scraping operation (HTML + assets)

## Security Model

### Threat Mitigation

1. **Input Validation**: Pydantic schemas prevent injection
2. **Rate Limiting**: Prevents abuse
3. **No credentials**: No auth bypass attempts
4. **User-agent rotation**: Reduces fingerprinting
5. **Respect robots.txt**: Ethical scraping
6. **Error disclosure**: No sensitive info in errors

### Compliance

- ✅ Respects robots.txt
- ✅ No authentication bypass
- ✅ No paywall circumvention
- ✅ Transparent error messages
- ✅ Rate limiting
- ✅ Terms of Service adherence

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API Framework | FastAPI | High-performance async API |
| Web Scraping | Playwright | Headless browser automation |
| HTML Parsing | BeautifulSoup4 | Flexible HTML extraction |
| Cache | SQLite + aiosqlite | Async SQLite operations |
| HTTP Client | httpx | Async HTTP requests |
| Retry Logic | tenacity | Exponential backoff retries |
| Logging | structlog | Structured JSON logging |
| Validation | Pydantic | Type-safe data models |
| Testing | pytest + pytest-asyncio | Async test support |
| Containerization | Docker + Docker Compose | Reproducible deployments |

## Extension Points

Areas designed for easy extension:

1. **New Rating Agencies**: Inherit from `BaseScraper`
2. **Alternative Search**: Replace `EntityResolver` search method
3. **Different Cache Backend**: Implement cache interface
4. **Authentication**: Add FastAPI dependency
5. **Webhooks**: Add notification service
6. **Historical Data**: Extend schema + scraper logic
