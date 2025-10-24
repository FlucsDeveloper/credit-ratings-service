"""Enhanced Entity Resolution using LLM for intelligent name matching."""

import asyncio
import json
from typing import Dict, List, Optional
from urllib.parse import quote_plus

from playwright.async_api import async_playwright

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import ResolvedEntity
from app.services.llm_client import LLMClient

logger = get_logger(__name__)


class LLMEntityResolver:
    """Entity resolver using LLM for intelligent name matching."""

    def __init__(self):
        """Initialize LLM entity resolver."""
        self.settings = get_settings()
        self.llm_client = LLMClient()
        self.playwright = None
        self.browser = None

    async def _ensure_browser(self) -> None:
        """Ensure browser is initialized."""
        if self.browser is None:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=self.settings.headless
            )

    async def close(self) -> None:
        """Close browser resources."""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def _generate_name_variations(self, company_name: str) -> List[str]:
        """Generate intelligent name variations using LLM."""
        prompt = f"""
        Given the company name: "{company_name}"

        Generate 5 different name variations that credit rating agencies might use.
        Consider:
        1. Full legal name (Inc., Corp., Ltd., S.A., etc.)
        2. Common abbreviations
        3. Without legal suffixes
        4. Stock ticker symbol (if publicly traded)
        5. Alternative spellings or common variations

        Return ONLY a JSON array of strings, nothing else.
        Example: ["Apple Inc.", "Apple Inc", "AAPL", "Apple Computer", "Apple"]
        """

        try:
            response = await self.llm_client.extract_text(prompt)
            if response and response != "[]":
                variations = json.loads(response)

                # Always include the original name
                if isinstance(variations, list) and company_name not in variations:
                    variations.insert(0, company_name)
                elif not isinstance(variations, list):
                    variations = [company_name]

                logger.info(
                    "name_variations_generated",
                    company_name=company_name,
                    variations=variations
                )
                return variations[:5]  # Limit to 5 variations
            else:
                raise ValueError("Empty response from LLM")

        except Exception as e:
            logger.warning(
                "llm_variation_generation_failed",
                company_name=company_name,
                error=str(e)
            )
            # Fallback to basic variations
            return [
                company_name,
                company_name.replace(" Inc.", ""),
                company_name.replace(" Corporation", ""),
                company_name.replace(" Ltd.", ""),
                company_name.split()[0] if " " in company_name else company_name
            ]

    def _get_search_url(self, agency: RatingAgency, query: str) -> str:
        """Get the search URL for each agency."""
        urls = {
            RatingAgency.FITCH: f"https://www.fitchratings.com/search?query={quote_plus(query)}",
            RatingAgency.SP: f"https://www.spglobal.com/ratings/en/search?searchQuery={quote_plus(query)}",
            RatingAgency.MOODYS: f"https://www.moodys.com/search?searchQuery={quote_plus(query)}"
        }
        return urls.get(agency, "")

    async def _search_agency_direct(
        self,
        company_variations: List[str],
        agency: RatingAgency
    ) -> Optional[Dict]:
        """Search directly on agency website with variations."""
        await self._ensure_browser()

        for variation in company_variations:
            search_url = self._get_search_url(agency, variation)
            logger.info(
                "searching_agency_direct",
                agency=agency.value,
                variation=variation,
                url=search_url
            )

            page = await self.browser.new_page()
            try:
                await page.set_extra_http_headers({
                    "User-Agent": self.settings.user_agent,
                })

                await page.goto(search_url, wait_until="networkidle", timeout=20000)
                await asyncio.sleep(2)  # Wait for dynamic content

                # Get page content
                content = await page.content()

                # Use LLM to analyze search results
                analysis_prompt = f"""
                Analyze these search results from {agency.value} for company: "{variation}"

                HTML Content (first 3000 chars):
                {content[:3000]}

                Look for:
                1. Is this the correct company? (not a subsidiary or different company)
                2. Any credit rating mentioned (AAA, AA+, BBB-, etc.)
                3. Link to the company's rating page

                Return JSON with format:
                {{
                    "found": true/false,
                    "confidence": 0.0-1.0,
                    "company_name": "exact name found",
                    "rating": "rating if found",
                    "url": "url to rating page if found"
                }}
                """

                try:
                    llm_response = await self.llm_client.extract_text(analysis_prompt)
                    if llm_response and llm_response != "[]":
                        result = json.loads(llm_response)

                        # Check if result is a dict and has the expected fields
                        if isinstance(result, dict) and result.get("found") and result.get("confidence", 0) > 0.7:
                            logger.info(
                                "entity_found",
                                agency=agency.value,
                                variation=variation,
                                result=result
                            )
                            await page.close()
                            return result

                except Exception as e:
                    logger.warning(
                        "llm_analysis_failed",
                        agency=agency.value,
                        variation=variation,
                        error=str(e)
                    )

            except Exception as e:
                logger.warning(
                    "search_error",
                    agency=agency.value,
                    variation=variation,
                    error=str(e)
                )

            finally:
                await page.close()

        return None

    async def resolve(
        self,
        company_name: str,
        country: Optional[str],
        agency: RatingAgency
    ) -> Optional[ResolvedEntity]:
        """
        Resolve company name using LLM-enhanced search.

        Args:
            company_name: Company legal name
            country: Optional ISO country code
            agency: Target rating agency

        Returns:
            ResolvedEntity with best match or None
        """
        logger.info(
            "llm_entity_resolution_start",
            company_name=company_name,
            country=country,
            agency=agency.value
        )

        # Generate intelligent name variations
        variations = await self._generate_name_variations(company_name)

        # Search agency directly
        result = await self._search_agency_direct(variations, agency)

        if result and result.get("found"):
            return ResolvedEntity(
                original_name=company_name,
                resolved_name=result.get("company_name", company_name),
                confidence=result.get("confidence", 0.8),
                agency=agency,
                source_url=result.get("url", self._get_search_url(agency, company_name)),
                alternatives=variations[1:] if len(variations) > 1 else []
            )

        logger.warning(
            "llm_entity_resolution_failed",
            company_name=company_name,
            agency=agency.value,
            variations_tried=variations
        )

        return None