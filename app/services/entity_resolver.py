"""Entity resolution service for disambiguating company names."""

import re
from difflib import SequenceMatcher
from typing import Optional
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import ResolvedEntity

logger = get_logger(__name__)


class EntityResolver:
    """Resolves company names to canonical entities across rating agencies."""

    def __init__(self) -> None:
        """Initialize entity resolver."""
        self.settings = get_settings()
        self.timeout = httpx.Timeout(10.0)

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

    async def resolve(
        self, company_name: str, country: Optional[str], agency: RatingAgency
    ) -> Optional[ResolvedEntity]:
        """
        Resolve company name to canonical entity for given agency.

        Args:
            company_name: Company legal name
            country: Optional ISO country code
            agency: Target rating agency

        Returns:
            ResolvedEntity with best match or None
        """
        search_query = self._build_search_query(company_name, country, agency)

        try:
            # Use DuckDuckGo HTML search (no API key needed, less aggressive blocking)
            # Note: In production, consider using SerpAPI or similar for better reliability
            search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(search_query)}"

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                headers = {
                    "User-Agent": self.settings.user_agent,
                    "Accept": "text/html",
                }
                response = await client.get(search_url, headers=headers, follow_redirects=True)
                response.raise_for_status()

            # Parse search results
            soup = BeautifulSoup(response.text, "lxml")
            results = self._parse_search_results(soup, agency)

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

        except httpx.HTTPError as e:
            logger.error(
                "search_http_error",
                company_name=company_name,
                agency=agency.value,
                error=str(e),
            )
            return None
        except Exception as e:
            logger.error(
                "resolve_error",
                company_name=company_name,
                agency=agency.value,
                error=str(e),
            )
            return None

    def _parse_search_results(self, soup: BeautifulSoup, agency: RatingAgency) -> list[dict]:
        """Extract search results from HTML."""
        results = []

        # DuckDuckGo result structure
        for result_div in soup.find_all("div", class_="result"):
            title_elem = result_div.find("a", class_="result__a")
            if not title_elem:
                continue

            title = title_elem.get_text(strip=True)
            url = title_elem.get("href", "")

            # Basic validation: ensure URL is from correct domain
            domain_checks = {
                RatingAgency.FITCH: "fitchratings.com",
                RatingAgency.SP: "spglobal.com",
                RatingAgency.MOODYS: "moodys.com",
            }

            if domain_checks[agency] not in url:
                continue

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
