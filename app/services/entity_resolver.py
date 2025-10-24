"""Entity resolution service for disambiguating company names."""

import re
from difflib import SequenceMatcher
from typing import Optional
from urllib.parse import quote_plus

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from bs4 import BeautifulSoup

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import ResolvedEntity
from app.services.known_entities import get_known_entity_url

logger = get_logger(__name__)


class EntityResolver:
    """Resolves company names to canonical entities across rating agencies."""

    def __init__(self) -> None:
        """Initialize entity resolver."""
        self.settings = get_settings()
        self.playwright = None
        self.browser = None

    def _similarity_score(self, str1: str, str2: str) -> float:
        """Calculate string similarity (0-1)."""
        return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()

    def _build_search_query(
        self, company_name: str, country: Optional[str], agency: RatingAgency
    ) -> str:
        """Build Google dork search query for specific agency."""
        base_queries = {
            RatingAgency.FITCH: f'site:fitchratings.com "{company_name}" rating',
            RatingAgency.SP: f'site:spglobal.com ratings "{company_name}"',
            RatingAgency.MOODYS: f'site:moodys.com "{company_name}" rating',
        }

        query = base_queries[agency]

        # Add country if provided
        if country:
            query += f" {country}"

        return query

    async def _ensure_browser(self) -> None:
        """Ensure browser is initialized."""
        if self.browser is None:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(headless=self.settings.headless)

    async def resolve(
        self, company_name: str, country: Optional[str], agency: RatingAgency
    ) -> Optional[ResolvedEntity]:
        """
        Resolve company name to canonical entity for given agency using Google Search.

        Args:
            company_name: Company legal name
            country: Optional ISO country code
            agency: Target rating agency

        Returns:
            ResolvedEntity with best match or None
        """
        # First, check if we have a known URL for this company
        known_url = get_known_entity_url(company_name, agency)
        if known_url:
            logger.info(
                "using_known_entity",
                company_name=company_name,
                agency=agency.value,
                url=known_url
            )
            return ResolvedEntity(
                name=company_name,
                country=country,
                canonical_url=known_url,
                confidence=0.95,  # High confidence for known entities
                ambiguous_candidates=[],
            )

        search_query = self._build_search_query(company_name, country, agency)

        try:
            await self._ensure_browser()

            # Try Google first, then fallback to DuckDuckGo
            results = []

            # Method 1: Try Google Search
            try:
                results = await self._search_google(search_query, agency)
            except Exception as e:
                logger.warning("google_search_failed", error=str(e))

            # Method 2: Fallback to DuckDuckGo if Google failed
            if not results:
                logger.info("fallback_to_duckduckgo", query=search_query)
                try:
                    results = await self._search_duckduckgo(search_query, agency)
                except Exception as e:
                    logger.warning("duckduckgo_search_failed", error=str(e))

            if not results:
                logger.warning(
                    "no_search_results",
                    company_name=company_name,
                    agency=agency.value,
                )
                return None

            # Score and rank candidates
            scored_results = []
            for result in results[: self.settings.max_search_results]:
                score = self._score_candidate(
                    result, company_name, country, self.settings.prefer_exact_match
                )
                scored_results.append((score, result))

            # Sort by score descending
            scored_results.sort(key=lambda x: x[0], reverse=True)

            best_score, best_result = scored_results[0]

            # Build ambiguous candidates list if confidence is low
            ambiguous = []
            if best_score < 0.85 and len(scored_results) > 1:
                for score, result in scored_results[1:4]:  # Top 3 alternatives
                    if score > 0.5:
                        ambiguous.append(
                            {
                                "name": result["title"],
                                "url": result["url"],
                                "confidence": round(score, 2),
                            }
                        )

            entity = ResolvedEntity(
                name=best_result["title"],
                country=country,
                canonical_url=best_result["url"],
                confidence=round(best_score, 2),
                ambiguous_candidates=ambiguous,
            )

            logger.info(
                "entity_resolved",
                company_name=company_name,
                resolved_name=entity.name,
                confidence=entity.confidence,
                agency=agency.value,
            )

            return entity

        except Exception as e:
            logger.error(
                "resolve_error",
                company_name=company_name,
                agency=agency.value,
                error=str(e),
            )
            return None

    async def _search_google(self, search_query: str, agency: RatingAgency) -> list[dict]:
        """Search Google using Playwright."""
        search_url = f"https://www.google.com/search?q={quote_plus(search_query)}&num=10"

        page = await self.browser.new_page()
        await page.set_extra_http_headers({
            "User-Agent": self.settings.user_agent,
            "Accept-Language": "en-US,en;q=0.9",
        })

        try:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(1000)

            html = await page.content()
            await page.close()

            soup = BeautifulSoup(html, "lxml")
            return self._parse_google_results(soup, agency)

        except PlaywrightTimeoutError:
            await page.close()
            raise Exception("Google search timeout")

    async def _search_duckduckgo(self, search_query: str, agency: RatingAgency) -> list[dict]:
        """Search DuckDuckGo using Playwright."""
        search_url = f"https://lite.duckduckgo.com/lite/?q={quote_plus(search_query)}"

        page = await self.browser.new_page()
        await page.set_extra_http_headers({
            "User-Agent": self.settings.user_agent,
        })

        try:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(1000)

            html = await page.content()
            await page.close()

            soup = BeautifulSoup(html, "lxml")
            return self._parse_duckduckgo_results(soup, agency)

        except PlaywrightTimeoutError:
            await page.close()
            raise Exception("DuckDuckGo search timeout")

    def _parse_google_results(self, soup: BeautifulSoup, agency: RatingAgency) -> list[dict]:
        """Extract search results from Google HTML."""
        results = []

        # Domain validation
        domain_checks = {
            RatingAgency.FITCH: "fitchratings.com",
            RatingAgency.SP: "spglobal.com",
            RatingAgency.MOODYS: "moodys.com",
        }
        target_domain = domain_checks[agency]

        # Google result structure - try multiple selectors
        # Google's structure changes frequently, so we use multiple selectors

        # Method 1: Standard Google result divs
        for result_div in soup.find_all("div", class_="g"):
            link = result_div.find("a", href=True)
            if not link:
                continue

            url = link.get("href", "")

            # Skip non-http links (like javascript:void)
            if not url.startswith("http"):
                continue

            # Check if URL is from target agency
            if target_domain not in url:
                continue

            # Get title - usually in h3 tag
            title_elem = link.find("h3")
            if title_elem:
                title = title_elem.get_text(strip=True)
            else:
                # Fallback: use link text
                title = link.get_text(strip=True)

            if title and url:
                results.append({"title": title, "url": url})

        # Method 2: Try alternative structure (cite tag contains URL)
        if not results:
            for cite in soup.find_all("cite"):
                url_text = cite.get_text(strip=True)
                if target_domain in url_text:
                    # Find parent link
                    parent = cite.find_parent("a", href=True)
                    if parent:
                        url = parent.get("href", "")
                        if url.startswith("http") and target_domain in url:
                            # Find title
                            title_elem = parent.find("h3")
                            title = title_elem.get_text(strip=True) if title_elem else url_text
                            if title:
                                results.append({"title": title, "url": url})

        return results

    def _parse_duckduckgo_results(self, soup: BeautifulSoup, agency: RatingAgency) -> list[dict]:
        """Extract search results from DuckDuckGo Lite HTML."""
        results = []

        # Domain validation
        domain_checks = {
            RatingAgency.FITCH: "fitchratings.com",
            RatingAgency.SP: "spglobal.com",
            RatingAgency.MOODYS: "moodys.com",
        }
        target_domain = domain_checks[agency]

        # DuckDuckGo Lite has simpler structure
        # Results are in table rows with class "result-link"
        for link in soup.find_all("a", class_="result-link"):
            url = link.get("href", "")

            if not url or not url.startswith("http"):
                continue

            # Check if URL is from target agency
            if target_domain not in url:
                continue

            # Get title from link text
            title = link.get_text(strip=True)

            if title and url:
                results.append({"title": title, "url": url})

        # Alternative: try finding all links and filter by URL
        if not results:
            for link in soup.find_all("a", href=True):
                url = link.get("href", "")

                if target_domain in url and url.startswith("http"):
                    title = link.get_text(strip=True)
                    if title:
                        results.append({"title": title, "url": url})

        return results

    def _score_candidate(
        self,
        result: dict,
        query_name: str,
        query_country: Optional[str],
        prefer_exact: bool,
    ) -> float:
        """
        Score a search result candidate.

        Scoring criteria:
        - Exact name match: +0.5
        - Fuzzy name similarity: up to +0.3
        - Country match: +0.1
        - URL contains "issuer" or "entity": +0.1
        """
        score = 0.0
        title = result["title"].lower()
        url = result["url"].lower()
        query_lower = query_name.lower()

        # Exact match
        if query_lower in title:
            score += 0.5
        elif prefer_exact:
            # If preferring exact and no exact match, penalize heavily
            score -= 0.2

        # Fuzzy similarity
        similarity = self._similarity_score(title, query_name)
        score += similarity * 0.3

        # Country match
        if query_country and query_country.lower() in title:
            score += 0.1

        # URL quality indicators
        if any(keyword in url for keyword in ["issuer", "entity", "credit-opinion", "profile"]):
            score += 0.1

        # Prefer issuer pages over press releases
        if "press-release" in url or "press_release" in url:
            score -= 0.05

        return max(0.0, min(1.0, score))  # Clamp to [0, 1]


def get_entity_resolver() -> EntityResolver:
    """Get entity resolver instance."""
    return EntityResolver()
