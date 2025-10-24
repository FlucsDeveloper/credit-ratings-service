"""Fitch Ratings scraper implementation."""

import re
from typing import Optional

from bs4 import BeautifulSoup

from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import AgencyRating
from app.scrapers.base import BaseScraper
from app.utils.rating_normalizer import normalize_fitch_sp_rating
from app.services.hardcoded_ratings import get_hardcoded_rating

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
                # Try hardcoded fallback before giving up
                company_name = entity_url.split("/")[-1].replace("-", " ").title()
                hardcoded = get_hardcoded_rating(company_name, self.agency, entity_url)
                if hardcoded:
                    logger.info("fitch_using_hardcoded_fallback", company=company_name)
                    return hardcoded

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

        # Get all text content from the page
        try:
            page_text = await page.inner_text("body")
        except:
            page_text = soup.get_text()

        # Strategy 1: Look for specific rating labels with context
        # Fitch typically shows "Long-Term IDR" or "Issuer Default Rating"
        patterns = [
            # Match "Long-Term IDR: BB-" or similar
            r"Long[- ]?Term\s+(?:Issuer\s+Default\s+)?(?:Rating|IDR)[:\s]+(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC|C|D)",
            # Match "IDR: BB-"
            r"(?:^|\n|\s)IDR[:\s]+(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC|C|D)",
            # Match "Issuer Default Rating: BB-"
            r"Issuer\s+Default\s+Rating[:\s]+(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC|C|D)",
            # Match lines with "Foreign Currency" (common in Fitch)
            r"Foreign\s+Currency[:\s]+.*?(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC|C|D)",
        ]

        for pattern in patterns:
            match = re.search(pattern, page_text, re.IGNORECASE | re.MULTILINE)
            if match:
                rating = self._clean_rating(match.group(1))
                if self._is_valid_sp_fitch_rating(rating):
                    logger.info("fitch_rating_extracted", pattern=pattern[:50], rating=rating)
                    return rating

        # Strategy 2: Find all rating-like patterns and pick the most common
        all_ratings = re.findall(
            r'\b(AAA|AA\+|AA|AA-|A\+|A|A-|BBB\+|BBB|BBB-|BB\+|BB|BB-|B\+|B|B-|CCC\+|CCC|CCC-|CC|C|D)\b',
            page_text
        )

        if all_ratings:
            # Count occurrences
            from collections import Counter
            rating_counts = Counter(all_ratings)
            # Get most common rating that's not D (D is too generic)
            for rating, count in rating_counts.most_common():
                if rating != 'D' and rating != 'A' and rating != 'B' and rating != 'C':  # Too generic
                    if self._is_valid_sp_fitch_rating(rating):
                        logger.info("fitch_rating_by_frequency", rating=rating, count=count)
                        return rating

        return None

    def _is_valid_sp_fitch_rating(self, rating: str) -> bool:
        """Validate if string is a proper S&P/Fitch rating."""
        valid_ratings = [
            'AAA', 'AA+', 'AA', 'AA-',
            'A+', 'A', 'A-',
            'BBB+', 'BBB', 'BBB-',
            'BB+', 'BB', 'BB-',
            'B+', 'B', 'B-',
            'CCC+', 'CCC', 'CCC-',
            'CC', 'C', 'D'
        ]
        return rating in valid_ratings

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
