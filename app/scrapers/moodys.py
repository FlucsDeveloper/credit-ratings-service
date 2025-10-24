"""Moody's Ratings scraper implementation."""

import re
from typing import Optional

from bs4 import BeautifulSoup

from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import AgencyRating
from app.scrapers.base import BaseScraper
from app.utils.rating_normalizer import normalize_moodys_rating

logger = get_logger(__name__)


class MoodysScraper(BaseScraper):
    """Scraper for Moody's Ratings."""

    def __init__(self):
        """Initialize Moody's scraper."""
        super().__init__(RatingAgency.MOODYS)

    @property
    def domain(self) -> str:
        """Return Moody's domain."""
        return "moodys.com"

    @property
    def is_allowed(self) -> bool:
        """Check if Moody's scraping is allowed."""
        return self.settings.scraping_allowed_moodys

    async def scrape(self, entity_url: str) -> AgencyRating:
        """
        Scrape Moody's rating from entity page.

        Args:
            entity_url: URL of Moody's issuer page

        Returns:
            AgencyRating with extracted data
        """
        if not self.is_allowed:
            return AgencyRating(
                blocked=True,
                error="Moody's scraping disabled in settings",
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

            # Normalize rating (Moody's specific scale)
            normalized = normalize_moodys_rating(rating)

            result = AgencyRating(
                raw=rating,
                outlook=outlook,
                normalized=normalized,
                last_updated=last_updated,
                source_url=entity_url,
                blocked=False,
            )

            logger.info(
                "moodys_scrape_success",
                url=entity_url,
                rating=rating,
                outlook=outlook.value if outlook else None,
            )

            return result

        except Exception as e:
            logger.error("moodys_scrape_error", url=entity_url, error=str(e))
            self.rate_limiter.record_failure(self.domain)
            return AgencyRating(
                source_url=entity_url,
                blocked=False,
                error=f"Scraping failed: {str(e)}",
            )

    async def _extract_rating(self, page, soup: BeautifulSoup) -> Optional[str]:
        """Extract long-term rating using multiple strategies."""

        # Get all text content from the page
        try:
            page_text = await page.inner_text("body")
        except:
            page_text = soup.get_text()

        # Strategy 1: Look for specific rating labels with context
        # Moody's typically shows "Issuer Rating" or "Long-Term Rating"
        patterns = [
            # Match "Issuer Rating: Ba2"
            r"Issuer\s+Rating[:\s]+(Aaa|Aa[1-3]|A[1-3]|Baa[1-3]|Ba[1-3]|B[1-3]|Caa[1-3]|Ca|C)",
            # Match "Long-Term Rating: Ba2"
            r"Long[- ]?Term\s+(?:Issuer\s+)?Rating[:\s]+(Aaa|Aa[1-3]|A[1-3]|Baa[1-3]|Ba[1-3]|B[1-3]|Caa[1-3]|Ca|C)",
            # Match "Senior Unsecured: Ba2"
            r"Senior\s+Unsecured[:\s]+(Aaa|Aa[1-3]|A[1-3]|Baa[1-3]|Ba[1-3]|B[1-3]|Caa[1-3]|Ca|C)",
            # Match "LT Issuer Rating: Ba2"
            r"LT\s+Issuer\s+Rating[:\s]+(Aaa|Aa[1-3]|A[1-3]|Baa[1-3]|Ba[1-3]|B[1-3]|Caa[1-3]|Ca|C)",
        ]

        for pattern in patterns:
            match = re.search(pattern, page_text, re.IGNORECASE | re.MULTILINE)
            if match:
                rating = self._clean_rating(match.group(1))
                if self._is_valid_moodys_rating(rating):
                    logger.info("moodys_rating_extracted", pattern=pattern[:50], rating=rating)
                    return rating

        # Strategy 2: Find all Moody's rating-like patterns and pick the most common
        # Moody's pattern is more specific: starts with capital, followed by lowercase 'a' or 'aa', then optional number
        all_ratings = re.findall(
            r'\b(Aaa|Aa1|Aa2|Aa3|A1|A2|A3|Baa1|Baa2|Baa3|Ba1|Ba2|Ba3|B1|B2|B3|Caa1|Caa2|Caa3|Ca|C)\b',
            page_text
        )

        if all_ratings:
            # Count occurrences
            from collections import Counter
            rating_counts = Counter(all_ratings)
            # Get most common rating that appears at least twice
            for rating, count in rating_counts.most_common():
                if count >= 2 and rating != 'C':  # C is too generic
                    if self._is_valid_moodys_rating(rating):
                        logger.info("moodys_rating_by_frequency", rating=rating, count=count)
                        return rating

        return None

    def _is_valid_moodys_rating(self, rating: str) -> bool:
        """
        Validate if string is a proper Moody's rating.

        Args:
            rating: Rating string to validate

        Returns:
            True if valid Moody's rating format
        """
        # Moody's ratings: Aaa, Aa1-3, A1-3, Baa1-3, Ba1-3, B1-3, Caa1-3, Ca, C
        valid_prefixes = ["Aaa", "Aa", "A", "Baa", "Ba", "B", "Caa", "Ca", "C"]

        for prefix in valid_prefixes:
            if rating.startswith(prefix):
                # Check suffix (should be nothing, or 1-3)
                suffix = rating[len(prefix) :]
                if suffix in ["", "1", "2", "3"]:
                    return True

        return False

    def _extract_outlook_from_page(self, soup: BeautifulSoup) -> Optional:
        """Extract outlook from page."""
        # Moody's often shows outlook in dedicated section
        outlook_elements = soup.find_all(string=re.compile(r"outlook|rating\s+review", re.IGNORECASE))

        for elem in outlook_elements[:3]:
            parent_text = elem.parent.get_text() if elem.parent else elem
            outlook = self._extract_outlook(str(parent_text))
            if outlook:
                return outlook

        return None

    def _extract_date_from_page(self, soup: BeautifulSoup) -> Optional:
        """Extract rating date from page."""
        # Look for "Rating Action" date or "Last Updated"
        date_labels = soup.find_all(
            string=re.compile(r"rating\s+action|last\s+updated|assigned", re.IGNORECASE)
        )

        for label in date_labels[:2]:
            if label.parent:
                parent_text = label.parent.get_text()
                date = self._extract_date(parent_text)
                if date:
                    return date

        return None
