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

        # Strategy 1: Look for Moody's specific rating containers
        selectors = [
            "div.rating-value",
            "span.issuer-rating",
            "td.rating-cell",
            "div.credit-rating__value",
        ]

        for selector in selectors:
            try:
                elements = await page.query_selector_all(selector)
                for elem in elements:
                    text = await elem.text_content()
                    if text:
                        # Moody's pattern: Aaa, Aa1, A2, Baa3, Ba1, B2, Caa1, Ca, C
                        match = re.search(r"\b([A-C][a-z]{0,2}[1-3]?)\b", text)
                        if match:
                            rating = self._clean_rating(match.group(1))
                            # Validate it's a proper Moody's rating
                            if rating and self._is_valid_moodys_rating(rating):
                                return rating
            except Exception:
                continue

        # Strategy 2: Look for specific sections (Issuer Rating, Long-Term Rating)
        section_keywords = ["long-term", "issuer rating", "senior unsecured"]
        for keyword in section_keywords:
            sections = soup.find_all(string=re.compile(keyword, re.IGNORECASE))
            for section in sections[:2]:
                if section.parent:
                    # Look for rating in surrounding elements
                    parent_text = section.parent.get_text()
                    match = re.search(r"\b([A-C][a-z]{0,2}[1-3]?)\b", parent_text)
                    if match:
                        rating = self._clean_rating(match.group(1))
                        if self._is_valid_moodys_rating(rating):
                            return rating

        # Strategy 3: Regex fallback on full HTML
        patterns = [
            r"Long[- ]Term\s+Rating[:\s]+([A-C][a-z]{0,2}[1-3]?)",
            r"Issuer\s+Rating[:\s]+([A-C][a-z]{0,2}[1-3]?)",
            r"Senior\s+Unsecured[:\s]+([A-C][a-z]{0,2}[1-3]?)",
        ]

        html_text = soup.get_text()
        for pattern in patterns:
            match = re.search(pattern, html_text, re.IGNORECASE)
            if match:
                rating = self._clean_rating(match.group(1))
                if self._is_valid_moodys_rating(rating):
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
