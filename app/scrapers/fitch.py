"""Fitch Ratings scraper implementation."""

import re
from typing import Optional

from bs4 import BeautifulSoup

from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import AgencyRating
from app.scrapers.base import BaseScraper
from app.utils.rating_normalizer import normalize_fitch_sp_rating

logger = get_logger(__name__)


class FitchScraper(BaseScraper):
    """Scraper for Fitch Ratings."""

    def __init__(self):
        """Initialize Fitch scraper."""
        super().__init__(RatingAgency.FITCH)

    @property
    def domain(self) -> str:
        """Return Fitch domain."""
        return "fitchratings.com"

    @property
    def is_allowed(self) -> bool:
        """Check if Fitch scraping is allowed."""
        return self.settings.scraping_allowed_fitch

    async def scrape(self, entity_url: str) -> AgencyRating:
        """
        Scrape Fitch rating from entity page.

        Args:
            entity_url: URL of Fitch issuer page

        Returns:
            AgencyRating with extracted data
        """
        if not self.is_allowed:
            return AgencyRating(
                blocked=True,
                error="Fitch scraping disabled in settings",
            )

        # Check rate limit
        allowed, reason = await self._check_rate_limit()
        if not allowed:
            return AgencyRating(blocked=True, error=reason)

        try:
            page, html = await self._fetch_page(entity_url)
            soup = BeautifulSoup(html, "lxml")

            # Extract rating
            rating = await self._extract_rating(page, soup)

            # Extract outlook
            outlook = self._extract_outlook_from_page(soup)

            # Extract date
            last_updated = self._extract_date_from_page(soup)

            await page.close()

            if not rating:
                return AgencyRating(
                    source_url=entity_url,
                    error="Could not extract rating from page",
                )

            # Normalize rating
            normalized = normalize_fitch_sp_rating(rating)

            result = AgencyRating(
                raw=rating,
                outlook=outlook,
                normalized=normalized,
                last_updated=last_updated,
                source_url=entity_url,
                blocked=False,
            )

            logger.info(
                "fitch_scrape_success",
                url=entity_url,
                rating=rating,
                outlook=outlook.value if outlook else None,
            )

            return result

        except Exception as e:
            logger.error("fitch_scrape_error", url=entity_url, error=str(e))
            self.rate_limiter.record_failure(self.domain)
            return AgencyRating(
                source_url=entity_url,
                blocked=False,
                error=f"Scraping failed: {str(e)}",
            )

    async def _extract_rating(self, page, soup: BeautifulSoup) -> Optional[str]:
        """Extract long-term rating using multiple strategies."""

        # Strategy 1: Look for "Issuer Default Rating" section
        selectors = [
            "div.rating-entity__idr",
            "div.rating-entity__rating",
            "span.rating-label:contains('IDR')",
            "div.rating-history-table td.rating-value",
        ]

        for selector in selectors:
            try:
                elements = await page.query_selector_all(selector)
                for elem in elements:
                    text = await elem.text_content()
                    if text:
                        # Extract rating pattern (e.g., "AA-", "BBB+")
                        match = re.search(r"\b([A-D][A-D]*[+-]?)\b", text)
                        if match:
                            rating = self._clean_rating(match.group(1))
                            if rating and len(rating) <= 4:  # Valid rating length
                                return rating
            except Exception:
                continue

        # Strategy 2: Regex fallback on full HTML
        patterns = [
            r"Long[- ]Term\s+(?:IDR|Rating)[:\s]+([A-D][A-D]*[+-]?)",
            r"Issuer\s+Default\s+Rating[:\s]+([A-D][A-D]*[+-]?)",
            r"IDR[:\s]+([A-D][A-D]*[+-]?)",
        ]

        html_text = soup.get_text()
        for pattern in patterns:
            match = re.search(pattern, html_text, re.IGNORECASE)
            if match:
                return self._clean_rating(match.group(1))

        return None

    def _extract_outlook_from_page(self, soup: BeautifulSoup) -> Optional:
        """Extract outlook from page."""
        # Look for outlook in common locations
        outlook_elements = soup.find_all(string=re.compile(r"outlook", re.IGNORECASE))

        for elem in outlook_elements[:3]:  # Check first 3 matches
            # Get surrounding text
            parent_text = elem.parent.get_text() if elem.parent else elem
            outlook = self._extract_outlook(str(parent_text))
            if outlook:
                return outlook

        return None

    def _extract_date_from_page(self, soup: BeautifulSoup) -> Optional:
        """Extract rating date from page."""
        # Look for date patterns near "rating action" or "affirmed"
        date_elements = soup.find_all(string=re.compile(r"\d{1,2}\s+\w+\s+\d{4}"))

        if date_elements:
            return self._extract_date(date_elements[0])

        return None
