"""Configuration for the credit rating scraper."""

HEADLESS = True
CONCURRENT_REQUESTS = 3
RETRY_MAX = 3
RETRY_BACKOFF = [1, 2, 4]  # seconds
REQUEST_DELAY = (1.5, 3.5)  # random delay between requests (min, max)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
]

CACHE_TTL_SUCCESS = 7 * 24 * 3600  # 7 days
CACHE_TTL_ERROR = 3600  # 1 hour
CACHE_DB_PATH = "ratings_cache.db"
