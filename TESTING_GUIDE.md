# Testing Guide

Comprehensive guide for testing the Credit Ratings Service.

## Quick Test Commands

```bash
# Run all tests
make test

# Run with coverage report
make test-cov

# Run specific test file
poetry run pytest tests/unit/test_rating_normalizer.py -v

# Run specific test
poetry run pytest tests/unit/test_cache.py::test_cache_set_and_get -v
```

---

## Manual API Testing

### 1. Start the Service

```bash
# Local
make run

# Or with Docker
make docker-up
```

### 2. Test Health Endpoint

```bash
curl http://localhost:8000/api/v1/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "service": "credit-ratings"
}
```

### 3. Test Ratings Endpoint

#### Brazilian Company Example

```bash
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Petróleo Brasileiro S.A.",
    "country": "BR",
    "prefer_exact_match": true
  }'
```

#### US Company Example

```bash
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Apple Inc.",
    "country": "US"
  }'
```

#### Without Country (Global Search)

```bash
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Toyota Motor Corporation"
  }'
```

---

## Using the Interactive API Docs

1. Open browser: http://localhost:8000/docs
2. Click "POST /api/v1/ratings"
3. Click "Try it out"
4. Enter request body:
   ```json
   {
     "company_name": "Microsoft Corporation",
     "country": "US"
   }
   ```
5. Click "Execute"
6. Review response below

---

## Testing with Python Script

Use the provided example script:

```bash
# Edit example_usage.py with your test company
poetry run python example_usage.py
```

Or create your own:

```python
import asyncio
import httpx

async def test_ratings():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/api/v1/ratings",
            json={
                "company_name": "Tesla Inc.",
                "country": "US",
            },
            timeout=60.0,
        )
        print(response.json())

asyncio.run(test_ratings())
```

---

## Testing Cache Behavior

### First Request (Cache Miss)

```bash
time curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"company_name": "Amazon.com Inc.", "country": "US"}'
```

**Expected**: Takes 15-45 seconds, `"cached": false`

### Second Request (Cache Hit)

```bash
time curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"company_name": "Amazon.com Inc.", "country": "US"}'
```

**Expected**: Takes <1 second, `"cached": true`

---

## Testing Rate Limiting

Run multiple requests quickly:

```bash
for i in {1..15}; do
  echo "Request $i"
  curl -X POST http://localhost:8000/api/v1/ratings \
    -H "Content-Type: application/json" \
    -d '{"company_name": "Test Company '$i'"}' \
    -w "\nTime: %{time_total}s\n\n"
  sleep 1
done
```

Watch logs for rate limit messages:

```bash
make docker-logs | grep -E "(rate_limit|circuit)"
```

---

## Testing Error Scenarios

### Invalid Request (No Company Name)

```bash
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"country": "BR"}'
```

**Expected**: HTTP 422 (Validation Error)

### Non-existent Company

```bash
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"company_name": "XYZ Nonexistent Corp 12345"}'
```

**Expected**: HTTP 200, but low confidence or no ratings found

---

## Load Testing

### Simple Load Test (with ApacheBench)

```bash
# Install ab (Apache Bench)
# macOS: brew install httpd
# Ubuntu: apt install apache2-utils

# Create request file
cat > post_data.json << EOF
{"company_name": "Test Company", "country": "US"}
EOF

# Run 100 requests, 10 concurrent
ab -n 100 -c 10 -p post_data.json -T application/json \
  http://localhost:8000/api/v1/ratings
```

### Load Test with Locust

Install:
```bash
pip install locust
```

Create `locustfile.py`:
```python
from locust import HttpUser, task, between

class RatingsUser(HttpUser):
    wait_time = between(1, 3)

    @task
    def get_ratings(self):
        self.client.post(
            "/api/v1/ratings",
            json={
                "company_name": "Test Company",
                "country": "US",
            }
        )
```

Run:
```bash
locust -f locustfile.py --host=http://localhost:8000
```

Open: http://localhost:8089

---

## Integration Testing

### Test Full Flow (Entity Resolution + Scraping)

```bash
# Test with well-known company that should have ratings
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Walmart Inc.",
    "country": "US"
  }' | jq '.'
```

**Verify**:
- `resolved.confidence` > 0.7
- At least 1 agency returns a rating
- `normalized` field is present for successful ratings

---

## Testing Logging

### View Structured Logs

```bash
# Docker
docker-compose logs api | tail -50

# Local
poetry run python -m app.main 2>&1 | jq '.'
```

### Filter Logs by Level

```bash
docker-compose logs api | jq 'select(.level == "error")'
```

### Track Cache Performance

```bash
docker-compose logs api | grep -E "(cache_hit|cache_miss)" | tail -20
```

---

## Database Testing

### Inspect Cache

```bash
# Copy database from container
docker cp credit-ratings-api:/app/data/cache.db ./cache-inspect.db

# Query with sqlite3
sqlite3 cache-inspect.db

# Show all cached companies
SELECT company_name, country, created_at, expires_at
FROM ratings_cache
ORDER BY created_at DESC
LIMIT 10;

# Check cache size
SELECT COUNT(*) as total_entries,
       SUM(LENGTH(response_data))/1024.0 as size_kb
FROM ratings_cache;

# Exit
.quit
```

### Manual Cache Cleanup

```bash
docker-compose exec api python -c "
import asyncio
from app.services.cache import get_cache_service

async def cleanup():
    cache = get_cache_service()
    await cache.initialize()
    deleted = await cache.cleanup_expired()
    print(f'Deleted {deleted} expired entries')

asyncio.run(cleanup())
"
```

---

## Performance Benchmarking

### Measure Response Times

```bash
# Cache miss (first request)
time curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"company_name": "Netflix Inc.", "country": "US"}' \
  -o /dev/null -s

# Cache hit (second request)
time curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"company_name": "Netflix Inc.", "country": "US"}' \
  -o /dev/null -s
```

### Monitor Resource Usage

```bash
# Container stats
docker stats credit-ratings-api

# Detailed metrics
docker stats --no-stream --format \
  "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
```

---

## Test Data Examples

### High Confidence Matches (Should Work Well)

```json
[
  {"company_name": "Apple Inc.", "country": "US"},
  {"company_name": "Microsoft Corporation", "country": "US"},
  {"company_name": "Petróleo Brasileiro S.A.", "country": "BR"},
  {"company_name": "Toyota Motor Corporation", "country": "JP"},
  {"company_name": "Banco Santander S.A.", "country": "ES"}
]
```

### Ambiguous Names (Test Disambiguation)

```json
[
  {"company_name": "Banco do Brasil"},  // Without country
  {"company_name": "National Bank"},    // Generic name
  {"company_name": "ABC Corp"}          // Too generic
]
```

### Edge Cases

```json
[
  {"company_name": "A"},                          // Single letter
  {"company_name": "Company with Very Long Name That Exceeds Normal Limits"},
  {"company_name": "Company-with-special-chars!@#"},
  {"company_name": "会社名 (Japanese characters)"}
]
```

---

## Automated Test Suite

### Run All Tests with Coverage

```bash
make test-cov

# View HTML coverage report
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
```

### Continuous Testing

```bash
# Install pytest-watch
poetry add --dev pytest-watch

# Auto-run tests on file changes
poetry run ptw
```

---

## Debugging Tests

### Run Tests with Debugging

```bash
# Drop into debugger on failure
poetry run pytest --pdb

# Show print statements
poetry run pytest -s

# Verbose output
poetry run pytest -vv

# Stop on first failure
poetry run pytest -x
```

### Debug Specific Test

```python
# In your test file, add:
import pdb; pdb.set_trace()

# Then run:
poetry run pytest tests/unit/test_cache.py -s
```

---

## CI/CD Testing (GitHub Actions Example)

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install poetry
          poetry install

      - name: Run tests
        run: poetry run pytest --cov=app --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

---

## Troubleshooting Tests

### Playwright Issues

```bash
# Reinstall browsers
poetry run playwright install chromium

# Run with visible browser (debug)
# In .env:
HEADLESS=false
```

### Database Locked

```bash
# Stop all instances
docker-compose down

# Remove database file
rm data/cache.db

# Restart
docker-compose up -d
```

### Port Already in Use

```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>

# Or use different port
# In .env:
PORT=8001
```

---

## Test Checklist

Before deploying:

- [ ] Health endpoint responds
- [ ] Ratings endpoint returns valid JSON
- [ ] Cache hit/miss works correctly
- [ ] Rate limiting triggers after threshold
- [ ] Circuit breaker opens after failures
- [ ] Logs are structured JSON
- [ ] All unit tests pass
- [ ] Coverage > 80%
- [ ] Docker image builds successfully
- [ ] Docker Compose starts cleanly

---

## Getting Help

If tests fail:

1. Check logs: `make docker-logs`
2. Verify environment: `docker-compose config`
3. Test connectivity: `curl http://localhost:8000/api/v1/health`
4. Review documentation: `README.md`, `ARCHITECTURE.md`
5. Open issue with logs and test case

---

*For more information, see the main README.md*
