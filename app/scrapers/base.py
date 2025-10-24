"""Base scraper class with common functionality."""

import random
import re
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from playwright.async_api import Browser, Page, async_playwright
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.enums import Outlook, RatingAgency
from app.models.schemas import AgencyRating
from app.services.rate_limiter import get_rate_limiter

logger = get_logger(__name__)


class BaseScraper(ABC):
    """Abstract base class for rating agency scrapers."""

    def __init__(self, agency: RatingAgency):
        """Initialize base scraper."""
        self.agency = agency
        self.settings = get_settings()
        self.rate_limiter = get_rate_limiter()
        self.browser: Optional[Browser] = None

    @property
    @abstractmethod
    def domain(self) -> str:
        """Return agency domain for rate limiting."""
        pass

    @property
    @abstractmethod
    def is_allowed(self) -> bool:
        """Check if scraping is allowed for this agency."""
        pass

    @abstractmethod
    async def scrape(self, entity_url: str) -> AgencyRating:
        """
        Scrape rating from agency page.

        Args:
            entity_url: URL of entity/issuer page

        Returns:
            AgencyRating with extracted data
        """
        pass

    async def _check_rate_limit(self) -> tuple[bool, Optional[str]]:
        """Check rate limiter before making request."""
        return await self.rate_limiter.acquire(self.domain)

    async def _init_browser(self) -> Browser:
        """Initialize Playwright browser if not already created."""
        if self.browser is None:
            playwright = await async_playwright().start()
            self.browser = await playwright.chromium.launch(headless=self.settings.headless)
        return self.browser

    async def _create_page(self) -> Page:
        """Create new browser page with random user agent."""
        browser = await self._init_browser()

        # Create context with more realistic settings
        context = await browser.new_context(
            user_agent=self._random_user_agent(),
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
        )

        page = await context.new_page()

        # Set comprehensive headers to avoid blocking
        await page.set_extra_http_headers(
            {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Cache-Control": "max-age=0",
            }
        )

        return page

    def _random_user_agent(self) -> str:
        """Generate randomized user agent."""
        user_agents = [
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ]
        return random.choice(user_agents)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def _fetch_page(self, url: str) -> tuple[Page, str]:
        """
        Fetch page with retries and error handling.

        Args:
            url: Target URL

        Returns:
            (Page object, HTML content) tuple

        Raises:
            Exception: If page cannot be fetched after retries
        """
        page = await self._create_page()

        try:
            # Add random delay before navigation to seem more human
            import time
            await page.wait_for_timeout(random.randint(500, 1500))

            response = await page.goto(url, timeout=self.settings.request_timeout, wait_until="networkidle")

            if response is None:
                raise Exception(f"No response received for {url}")

            status = response.status

            # Check for blocking
            if status in [403, 429]:
                logger.warning("scrape_blocked", url=url, status=status, agency=self.agency.value)
                self.rate_limiter.record_failure(self.domain)
                raise Exception(f"Blocked with status {status}")

            if status >= 400:
                raise Exception(f"HTTP {status} for {url}")

            # Wait for content to load completely
            await page.wait_for_load_state("domcontentloaded")

            # Add extra wait for dynamic content
            await page.wait_for_timeout(random.randint(1000, 2000))

            html = await page.content()
            self.rate_limiter.record_success(self.domain)

            return page, html

        except Exception as e:
            await page.close()
            raise

    def _extract_outlook(self, text: str) -> Optional[Outlook]:
        """
        Extract outlook from text using patterns.

        Args:
            text: Text to search

        Returns:
            Outlook enum or None
        """
        text_lower = text.lower()

        outlook_patterns = {
            Outlook.POSITIVE: ["positive", "pos"],
            Outlook.STABLE: ["stable", "stb"],
            Outlook.NEGATIVE: ["negative", "neg"],
            Outlook.DEVELOPING: ["developing", "watch", "dev"],
        }

        for outlook, patterns in outlook_patterns.items():
            if any(pattern in text_lower for pattern in patterns):
                return outlook

        return None

    def _extract_date(self, text: str) -> Optional[datetime]:
        """
        Extract date from text using common patterns.

        Args:
            text: Text containing date

        Returns:
            Parsed datetime or None
        """
        # Common date patterns
        patterns = [
            r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})",
            r"(\d{4})-(\d{2})-(\d{2})",
            r"(\d{2})/(\d{2})/(\d{4})",
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    # This is simplified; production would use dateutil.parser
                    return datetime.utcnow()  # Placeholder
                except Exception:
                    continue

        return None

    def _clean_rating(self, rating: str) -> str:
        """
        Clean rating string.

        Args:
            rating: Raw rating string

        Returns:
            Cleaned rating
        """
        # Remove common prefixes/suffixes
        rating = re.sub(r"\s*\(.*?\)", "", rating)  # Remove parentheses
        rating = rating.strip()
        return rating

    async def close(self) -> None:
        """Close browser instance."""
        if self.browser:
            await self.browser.close()
            self.browser = None
