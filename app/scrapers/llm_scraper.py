"""LLM-based scraper for credit ratings using AI for dynamic extraction."""

from datetime import datetime
from typing import Optional, Dict, Any
from urllib.parse import urlparse

from playwright.async_api import Page
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.enums import Outlook, RatingAgency
from app.models.schemas import AgencyRating
from app.scrapers.base import BaseScraper
from app.services.llm_client import LLMCreditScoreExtractor, CreditScoreData
from app.utils.rating_normalizer import normalize_fitch_sp_rating, normalize_moodys_rating

logger = get_logger(__name__)


class LLMScraper(BaseScraper):
    """
    Universal scraper using LLM for credit rating extraction.
    Works with any rating agency website dynamically.
    """

    def __init__(self, agency: RatingAgency):
        """Initialize LLM scraper."""
        super().__init__(agency)
        self.llm_extractor = LLMCreditScoreExtractor()
        # self.normalizer will be handled directly in normalization method

    @property
    def domain(self) -> str:
        """Return agency domain for rate limiting."""
        domain_map = {
            RatingAgency.FITCH: "www.fitchratings.com",
            RatingAgency.SP: "www.spglobal.com",
            RatingAgency.MOODYS: "www.moodys.com",
        }
        return domain_map.get(self.agency, "unknown")

    @property
    def is_allowed(self) -> bool:
        """Check if scraping is allowed for this agency."""
        if self.agency == RatingAgency.FITCH:
            return self.settings.scraping_allowed_fitch
        elif self.agency == RatingAgency.SP:
            return self.settings.scraping_allowed_sp
        elif self.agency == RatingAgency.MOODYS:
            return self.settings.scraping_allowed_moodys
        return False

    async def scrape(self, entity_url: str, company_name: Optional[str] = None) -> AgencyRating:
        """
        Scrape rating from agency page using LLM extraction.

        Args:
            entity_url: URL of entity/issuer page
            company_name: Optional company name hint for better extraction

        Returns:
            AgencyRating with extracted data
        """
        logger.info(
            "llm_scrape_start",
            agency=self.agency.value,
            url=entity_url,
            company=company_name,
        )

        # Check if scraping is allowed
        if not self.is_allowed:
            logger.warning("scraping_not_allowed", agency=self.agency.value)
            return AgencyRating(
                raw=None,
                outlook=None,
                normalized=None,
                last_updated=None,
                source_url=entity_url,
                blocked=True,
                error="Scraping not allowed for this agency",
            )

        # Check rate limit
        allowed, reason = await self._check_rate_limit()
        if not allowed:
            logger.warning(
                "rate_limit_exceeded",
                agency=self.agency.value,
                reason=reason,
            )
            return AgencyRating(
                raw=None,
                outlook=None,
                normalized=None,
                last_updated=None,
                source_url=entity_url,
                blocked=True,
                error=f"Rate limited: {reason}",
            )

        try:
            # Fetch page
            page, html = await self._fetch_page(entity_url)

            # Wait for dynamic content to load
            await self._wait_for_content(page)

            # Get updated HTML after dynamic content loads
            html = await page.content()

            # Extract using LLM
            extraction_result = await self.llm_extractor.extract_from_html(
                html_content=html,
                url=entity_url,
                company_hint=company_name
            )

            # Convert to AgencyRating
            rating = self._convert_to_agency_rating(extraction_result, entity_url)

            logger.info(
                "llm_scrape_success",
                agency=self.agency.value,
                url=entity_url,
                rating=rating.raw,
                confidence=extraction_result.confidence,
            )

            # Close page
            await page.close()

            return rating

        except Exception as e:
            logger.error(
                "llm_scrape_error",
                agency=self.agency.value,
                url=entity_url,
                error=str(e),
            )
            return AgencyRating(
                raw=None,
                outlook=None,
                normalized=None,
                last_updated=None,
                source_url=entity_url,
                blocked=False,
                error=f"Extraction failed: {str(e)}",
            )

    async def _wait_for_content(self, page: Page) -> None:
        """Wait for dynamic content to load based on agency."""
        try:
            if self.agency == RatingAgency.FITCH:
                # Wait for rating elements on Fitch
                await page.wait_for_selector(
                    "text=/rating|score|credit/i",
                    timeout=5000,
                    state="visible"
                )
            elif self.agency == RatingAgency.SP:
                # Wait for S&P rating elements
                await page.wait_for_selector(
                    "text=/rating|score|credit/i",
                    timeout=5000,
                    state="visible"
                )
            elif self.agency == RatingAgency.MOODYS:
                # Wait for Moody's rating elements
                await page.wait_for_selector(
                    "text=/rating|score|credit/i",
                    timeout=5000,
                    state="visible"
                )
            else:
                # Generic wait for any rating-related content
                await page.wait_for_load_state("domcontentloaded")
                await page.wait_for_timeout(2000)  # Additional wait for JS

        except Exception as e:
            logger.warning(
                "content_wait_timeout",
                agency=self.agency.value,
                error=str(e)
            )
            # Continue anyway - LLM might still extract from partial content

    def _convert_to_agency_rating(
        self,
        extraction: CreditScoreData,
        url: str
    ) -> AgencyRating:
        """Convert LLM extraction result to AgencyRating."""
        # Determine raw rating
        raw_rating = extraction.rating
        if not raw_rating and extraction.score is not None:
            # Convert numeric score to rating if needed
            raw_rating = self._score_to_rating(
                extraction.score,
                extraction.score_range_min,
                extraction.score_range_max
            )

        # Parse outlook
        outlook = None
        if extraction.outlook:
            outlook_map = {
                'stable': Outlook.STABLE,
                'positive': Outlook.POSITIVE,
                'negative': Outlook.NEGATIVE,
                'developing': Outlook.DEVELOPING,
                'watch': Outlook.DEVELOPING,
            }
            outlook = outlook_map.get(extraction.outlook.lower())

        # Parse date
        last_updated = None
        if extraction.last_updated:
            try:
                last_updated = datetime.fromisoformat(extraction.last_updated)
            except:
                try:
                    from dateutil import parser
                    last_updated = parser.parse(extraction.last_updated)
                except:
                    logger.warning(
                        "date_parsing_failed",
                        date_str=extraction.last_updated
                    )

        # Normalize rating
        normalized = None
        if raw_rating:
            try:
                if self.agency in [RatingAgency.FITCH, RatingAgency.SP]:
                    normalized = normalize_fitch_sp_rating(raw_rating)
                elif self.agency == RatingAgency.MOODYS:
                    normalized = normalize_moodys_rating(raw_rating)
            except Exception as e:
                logger.warning(
                    "normalization_failed",
                    rating=raw_rating,
                    error=str(e)
                )

        # Add extraction notes if confidence is low
        error = None
        if extraction.confidence < 0.5:
            error = f"Low confidence extraction ({extraction.confidence:.2f})"
            if extraction.extraction_notes:
                error += f": {extraction.extraction_notes}"

        return AgencyRating(
            raw=raw_rating,
            outlook=outlook,
            normalized=normalized,
            last_updated=last_updated,
            source_url=url,
            blocked=False,
            error=error,
        )

    def _score_to_rating(
        self,
        score: float,
        min_score: float,
        max_score: float
    ) -> Optional[str]:
        """Convert numeric score to letter rating based on agency conventions."""
        if score is None:
            return None

        # Normalize to 0-100 scale
        normalized_score = ((score - min_score) / (max_score - min_score)) * 100

        # Map to ratings based on agency
        if self.agency in [RatingAgency.FITCH, RatingAgency.SP]:
            if normalized_score >= 95:
                return "AAA"
            elif normalized_score >= 90:
                return "AA+"
            elif normalized_score >= 85:
                return "AA"
            elif normalized_score >= 80:
                return "AA-"
            elif normalized_score >= 75:
                return "A+"
            elif normalized_score >= 70:
                return "A"
            elif normalized_score >= 65:
                return "A-"
            elif normalized_score >= 60:
                return "BBB+"
            elif normalized_score >= 55:
                return "BBB"
            elif normalized_score >= 50:
                return "BBB-"
            elif normalized_score >= 45:
                return "BB+"
            elif normalized_score >= 40:
                return "BB"
            elif normalized_score >= 35:
                return "BB-"
            elif normalized_score >= 30:
                return "B+"
            elif normalized_score >= 25:
                return "B"
            elif normalized_score >= 20:
                return "B-"
            elif normalized_score >= 15:
                return "CCC+"
            elif normalized_score >= 10:
                return "CCC"
            elif normalized_score >= 5:
                return "CCC-"
            else:
                return "D"

        elif self.agency == RatingAgency.MOODYS:
            if normalized_score >= 95:
                return "Aaa"
            elif normalized_score >= 90:
                return "Aa1"
            elif normalized_score >= 85:
                return "Aa2"
            elif normalized_score >= 80:
                return "Aa3"
            elif normalized_score >= 75:
                return "A1"
            elif normalized_score >= 70:
                return "A2"
            elif normalized_score >= 65:
                return "A3"
            elif normalized_score >= 60:
                return "Baa1"
            elif normalized_score >= 55:
                return "Baa2"
            elif normalized_score >= 50:
                return "Baa3"
            elif normalized_score >= 45:
                return "Ba1"
            elif normalized_score >= 40:
                return "Ba2"
            elif normalized_score >= 35:
                return "Ba3"
            elif normalized_score >= 30:
                return "B1"
            elif normalized_score >= 25:
                return "B2"
            elif normalized_score >= 20:
                return "B3"
            elif normalized_score >= 15:
                return "Caa1"
            elif normalized_score >= 10:
                return "Caa2"
            elif normalized_score >= 5:
                return "Caa3"
            else:
                return "C"

        return None


class UniversalLLMScraper:
    """
    Universal scraper that can work with any website using LLM extraction.
    Not limited to specific rating agencies.
    """

    def __init__(self):
        """Initialize universal LLM scraper."""
        self.settings = get_settings()
        self.llm_extractor = LLMCreditScoreExtractor()
        self.browser = None

    async def scrape_url(
        self,
        url: str,
        company_name: Optional[str] = None,
        wait_selector: Optional[str] = None
    ) -> CreditScoreData:
        """
        Scrape credit score from any URL.

        Args:
            url: Target URL
            company_name: Optional company name hint
            wait_selector: Optional selector to wait for before extraction

        Returns:
            Extracted credit score data
        """
        logger.info("universal_scrape_start", url=url, company=company_name)

        try:
            # Initialize browser
            if not self.browser:
                from playwright.async_api import async_playwright
                playwright = await async_playwright().start()
                self.browser = await playwright.chromium.launch(
                    headless=self.settings.headless
                )

            # Create page
            page = await self.browser.new_page()

            # Navigate to URL
            response = await page.goto(url, timeout=self.settings.request_timeout)

            if response.status >= 400:
                raise Exception(f"HTTP {response.status} for {url}")

            # Wait for content
            if wait_selector:
                try:
                    await page.wait_for_selector(
                        wait_selector,
                        timeout=5000,
                        state="visible"
                    )
                except:
                    logger.warning("selector_wait_timeout", selector=wait_selector)

            await page.wait_for_load_state("domcontentloaded")
            await page.wait_for_timeout(2000)  # Additional wait for JS

            # Get HTML content
            html = await page.content()

            # Extract using LLM
            result = await self.llm_extractor.extract_from_html(
                html_content=html,
                url=url,
                company_hint=company_name
            )

            # Close page
            await page.close()

            logger.info(
                "universal_scrape_success",
                url=url,
                score=result.score,
                confidence=result.confidence,
            )

            return result

        except Exception as e:
            logger.error("universal_scrape_error", url=url, error=str(e))
            return CreditScoreData(
                confidence=0.0,
                extraction_notes=f"Scraping failed: {str(e)}"
            )

    async def close(self):
        """Close browser resources."""
        if self.browser:
            await self.browser.close()
            self.browser = None