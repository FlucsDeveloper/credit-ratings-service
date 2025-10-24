"""S&P Global Ratings scraper implementation."""

import re
from typing import Optional

from bs4 import BeautifulSoup

from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import AgencyRating
from app.scrapers.base import BaseScraper
from app.utils.rating_normalizer import normalize_fitch_sp_rating

logger = get_logger(__name__)


class SPScraper(BaseScraper):
    """Scraper for S&P Global Ratings."""

    def __init__(self):
        """Initialize S&P scraper."""
        super().__init__(RatingAgency.SP)

    @property
    def domain(self) -> str:
        """Return S&P domain."""
        return "spglobal.com"

    @property
    def is_allowed(self) -> bool:
        """Check if S&P scraping is allowed."""
        return self.settings.scraping_allowed_sp

    async def scrape(self, entity_url: str) -> AgencyRating:
        """
        Scrape S&P rating from entity page.

        Args:
            entity_url: URL of S&P issuer page

        Returns:
            AgencyRating with extracted data
        """
        if not self.is_allowed:
            return AgencyRating(
                blocked=True,
                error="S&P scraping disabled in settings",
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

            # Normalize rating (S&P uses same scale as Fitch)
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
                "sp_scrape_success",
                url=entity_url,
                rating=rating,
                outlook=outlook.value if outlook else None,
            )

            return result

        except Exception as e:
            logger.error("sp_scrape_error", url=entity_url, error=str(e))
            self.rate_limiter.record_failure(self.domain)
            return AgencyRating(
                source_url=entity_url,
                blocked=False,
                error=f"Scraping failed: {str(e)}",
            )

    async def _extract_rating(self, page, soup: BeautifulSoup) -> Optional[str]:
        """Extract long-term rating using multiple strategies."""

        # Strategy 1: Look for "Issuer Credit Rating" or "Foreign Currency"
        selectors = [
            "div.ratings-entity__rating-value",
            "td.rating-value",
            "span.entity-rating__value",
            "div.credit-rating-value",
        ]

        for selector in selectors:
            try:
                elements = await page.query_selector_all(selector)
                for elem in elements:
                    text = await elem.text_content()
                    if text and ("long" in text.lower() or "issuer" in text.lower()):
                        # Extract rating pattern
                        match = re.search(r"\b([A-D][A-D]*[+-]?)\b", text)
                        if match:
                            rating = self._clean_rating(match.group(1))
                            if rating and len(rating) <= 4:
                                return rating
            except Exception:
                continue

        # Strategy 2: Look for table with ratings
        tables = soup.find_all("table", class_=re.compile(r"rating|credit"))
        for table in tables[:3]:
            rows = table.find_all("tr")
            for row in rows:
                text = row.get_text()
                if any(
                    keyword in text.lower()
                    for keyword in ["long-term", "issuer credit rating", "foreign currency"]
                ):
                    # Find rating in this row
                    match = re.search(r"\b([A-D][A-D]*[+-]?)\b", text)
                    if match:
                        rating = self._clean_rating(match.group(1))
                        if rating and len(rating) <= 4:
                            return rating

        # Strategy 3: Regex fallback
        patterns = [
            r"Long[- ]Term\s+(?:Rating|ICR)[:\s]+([A-D][A-D]*[+-]?)",
            r"Issuer\s+Credit\s+Rating[:\s]+([A-D][A-D]*[+-]?)",
            r"Foreign\s+Currency[:\s]+([A-D][A-D]*[+-]?)",
        ]

        html_text = soup.get_text()
        for pattern in patterns:
            match = re.search(pattern, html_text, re.IGNORECASE)
            if match:
                return self._clean_rating(match.group(1))

        return None

    def _extract_outlook_from_page(self, soup: BeautifulSoup) -> Optional:
        """Extract outlook from page."""
        # S&P typically shows outlook near the rating
        outlook_elements = soup.find_all(
            string=re.compile(r"outlook|watch", re.IGNORECASE)
        )

        for elem in outlook_elements[:3]:
            parent_text = elem.parent.get_text() if elem.parent else elem
            outlook = self._extract_outlook(str(parent_text))
            if outlook:
                return outlook

        return None

    def _extract_date_from_page(self, soup: BeautifulSoup) -> Optional:
        """Extract rating date from page."""
        # Look for "Rating Date" or similar
        date_labels = soup.find_all(string=re.compile(r"rating\s+date|as\s+of", re.IGNORECASE))

        for label in date_labels[:2]:
            if label.parent:
                # Look for date in same row/div
                parent_text = label.parent.get_text()
                date = self._extract_date(parent_text)
                if date:
                    return date

        return None
