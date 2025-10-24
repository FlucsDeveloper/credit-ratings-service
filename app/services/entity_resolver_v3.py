"""Direct agency site search resolver using Playwright."""

from typing import List, Optional, Tuple
from urllib.parse import quote_plus

from playwright.async_api import async_playwright, Page, TimeoutError as PlaywrightTimeoutError

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import ResolvedEntity
from app.utils.name_normalizer import (
    calculate_name_similarity,
    generate_name_variations,
)

logger = get_logger(__name__)


class DirectAgencyResolver:
    """Resolver using direct agency website searches via Playwright."""

    def __init__(self) -> None:
        """Initialize direct agency resolver."""
        self.settings = get_settings()
        self.playwright = None
        self.browser = None

    async def _ensure_browser(self) -> None:
        """Ensure browser is initialized."""
        if self.browser is None:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=self.settings.headless
            )

    async def _fetch_page(self, url: str) -> Page:
        """
        Fetch page using Playwright.

        Args:
            url: URL to fetch

        Returns:
            Playwright Page object
        """
        await self._ensure_browser()

        page = await self.browser.new_page()
        await page.set_extra_http_headers({
            "User-Agent": self.settings.user_agent,
        })

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        except Exception as e:
            logger.warning("page_fetch_error", url=url, error=str(e))
            await page.close()
            raise

        return page

    async def close(self) -> None:
        """Close browser resources."""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def resolve(
        self, company_name: str, country: Optional[str], agency: RatingAgency
    ) -> Optional[ResolvedEntity]:
        """
        Resolve company name by searching directly on agency site.

        Args:
            company_name: Company legal name
            country: Optional ISO country code
            agency: Target rating agency

        Returns:
            ResolvedEntity with best match or None
        """
        logger.info(
            "direct_resolution_start",
            company_name=company_name,
            country=country,
            agency=agency.value,
        )

        # Generate name variations
        variations = generate_name_variations(company_name)[:5]

        # Try each variation
        all_candidates: List[dict] = []

        for idx, variation in enumerate(variations):
            try:
                candidates = await self._search_agency_site(
                    variation, country, agency
                )
                all_candidates.extend(candidates)

                # Stop if we have enough good candidates
                if len(all_candidates) >= 10:
                    break

            except Exception as e:
                logger.warning(
                    "agency_search_failed",
                    variation_index=idx,
                    variation=variation[:50],
                    error=str(e),
                )
                continue

        if not all_candidates:
            logger.warning(
                "no_candidates_found_direct",
                company_name=company_name,
                agency=agency.value,
                variations_tried=len(variations),
            )
            return None

        # Deduplicate by URL
        seen_urls: set = set()
        unique_candidates = []
        for candidate in all_candidates:
            url = candidate["url"]
            if url not in seen_urls:
                seen_urls.add(url)
                unique_candidates.append(candidate)

        # Score all candidates
        scored_candidates = self._score_candidates(
            unique_candidates,
            company_name,
            country,
        )

        # Log top candidates for debugging
        self._log_top_candidates(scored_candidates, company_name)

        if not scored_candidates:
            return None

        # Get best candidate
        best_score, best_candidate = scored_candidates[0]

        # Build ambiguous list (alternatives with score > 0.4)
        ambiguous = []
        for score, candidate in scored_candidates[1:6]:  # Top 5 alternatives
            if score > 0.4:
                ambiguous.append({
                    "name": candidate["title"],
                    "url": candidate["url"],
                    "confidence": round(score, 2),
                })

        entity = ResolvedEntity(
            name=best_candidate["title"],
            country=country,
            canonical_url=best_candidate["url"],
            confidence=round(best_score, 2),
            ambiguous_candidates=ambiguous,
        )

        logger.info(
            "entity_resolved_direct",
            company_name=company_name,
            resolved_name=entity.name,
            confidence=entity.confidence,
            agency=agency.value,
            alternatives=len(ambiguous),
        )

        return entity

    async def _search_agency_site(
        self, query: str, country: Optional[str], agency: RatingAgency
    ) -> List[dict]:
        """
        Search directly on agency site using their search feature.

        Args:
            query: Search query
            country: Optional country
            agency: Rating agency

        Returns:
            List of candidate results
        """
        if agency == RatingAgency.FITCH:
            return await self._search_fitch(query, country)
        elif agency == RatingAgency.SP:
            return await self._search_sp(query, country)
        else:  # MOODYS
            return await self._search_moodys(query, country)

    async def _search_fitch(
        self, query: str, country: Optional[str]
    ) -> List[dict]:
        """Search Fitch site."""
        candidates = []

        try:
            search_url = f"https://www.fitchratings.com/search?query={quote_plus(query)}&content=Issuer"

            page = await self._fetch_page(search_url)

            # Wait for search results
            await page.wait_for_timeout(2000)

            # Extract results
            result_links = await page.query_selector_all("a[href*='/entity/']")

            for link in result_links[:10]:  # Top 10 results
                href = await link.get_attribute("href")
                text = await link.text_content()

                if href and text:
                    full_url = f"https://www.fitchratings.com{href}" if href.startswith("/") else href
                    candidates.append({
                        "title": text.strip(),
                        "url": full_url,
                        "snippet": "",
                    })

            await page.close()

        except Exception as e:
            logger.warning("fitch_search_error", query=query, error=str(e))

        return candidates

    async def _search_sp(
        self, query: str, country: Optional[str]
    ) -> List[dict]:
        """Search S&P Global site."""
        candidates = []

        try:
            # S&P has a search API-like endpoint
            search_url = f"https://www.spglobal.com/ratings/en/search/results?search={quote_plus(query)}"

            page = await self._fetch_page(search_url)

            # Wait for results
            await page.wait_for_timeout(2000)

            # Extract results - look for entity links
            result_links = await page.query_selector_all("a[href*='/ratings/en/entity/']")

            for link in result_links[:10]:
                href = await link.get_attribute("href")
                text = await link.text_content()

                if href and text:
                    full_url = f"https://www.spglobal.com{href}" if href.startswith("/") else href
                    candidates.append({
                        "title": text.strip(),
                        "url": full_url,
                        "snippet": "",
                    })

            await page.close()

        except Exception as e:
            logger.warning("sp_search_error", query=query, error=str(e))

        return candidates

    async def _search_moodys(
        self, query: str, country: Optional[str]
    ) -> List[dict]:
        """Search Moody's site."""
        candidates = []

        try:
            # Moody's search
            search_url = f"https://www.moodys.com/search?q={quote_plus(query)}&type=issuer"

            page = await self._fetch_page(search_url)

            # Wait for results
            await page.wait_for_timeout(2000)

            # Extract results
            result_links = await page.query_selector_all("a[href*='/credit-ratings/']")

            for link in result_links[:10]:
                href = await link.get_attribute("href")
                text = await link.text_content()

                if href and text:
                    full_url = f"https://www.moodys.com{href}" if href.startswith("/") else href
                    candidates.append({
                        "title": text.strip(),
                        "url": full_url,
                        "snippet": "",
                    })

            await page.close()

        except Exception as e:
            logger.warning("moodys_search_error", query=query, error=str(e))

        return candidates

    def _score_candidates(
        self,
        candidates: List[dict],
        query_name: str,
        query_country: Optional[str],
    ) -> List[Tuple[float, dict]]:
        """
        Score candidates with enhanced algorithm.

        Args:
            candidates: List of search results
            query_name: Original query name
            query_country: Optional country

        Returns:
            List of (score, candidate) tuples, sorted by score descending
        """
        scored = []

        for candidate in candidates:
            score = self._calculate_candidate_score(
                candidate,
                query_name,
                query_country,
            )
            scored.append((score, candidate))

        # Sort by score descending
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    def _calculate_candidate_score(
        self,
        candidate: dict,
        query_name: str,
        query_country: Optional[str],
    ) -> float:
        """
        Calculate score for a single candidate.

        Scoring factors:
        - Name similarity (0-0.7)
        - Country match (0-0.2)
        - URL quality (0-0.1)
        """
        score = 0.0
        title = candidate["title"]
        url = candidate["url"].lower()

        # 1. Name similarity (most important - up to 0.7)
        name_sim = calculate_name_similarity(title, query_name)
        score += name_sim * 0.7

        # 2. Country match (0.2)
        if query_country:
            country_lower = query_country.lower()
            if country_lower in title.lower():
                score += 0.2

        # 3. URL quality (0.1)
        if any(keyword in url for keyword in ["entity", "issuer", "credit-rating"]):
            score += 0.1

        return max(0.0, min(1.0, score))

    def _log_top_candidates(
        self,
        scored_candidates: List[Tuple[float, dict]],
        query_name: str,
    ) -> None:
        """Log top candidates for debugging."""
        if not scored_candidates:
            return

        logger.info(
            "top_candidates_direct",
            query=query_name,
            count=len(scored_candidates),
            top_3=[
                {
                    "score": round(score, 3),
                    "title": candidate["title"][:80],
                    "url": candidate["url"][:100],
                }
                for score, candidate in scored_candidates[:3]
            ],
        )


def get_direct_agency_resolver() -> DirectAgencyResolver:
    """Get direct agency resolver instance."""
    return DirectAgencyResolver()
