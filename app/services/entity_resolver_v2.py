"""Enhanced entity resolution service with better disambiguation."""

import re
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import ResolvedEntity
from app.utils.name_normalizer import (
    calculate_name_similarity,
    generate_name_variations,
    normalize_company_name,
)

logger = get_logger(__name__)


class EnhancedEntityResolver:
    """Enhanced entity resolver with better name matching and disambiguation."""

    def __init__(self) -> None:
        """Initialize enhanced entity resolver."""
        self.settings = get_settings()
        self.timeout = httpx.Timeout(15.0)

    def _build_search_dorks(
        self, company_name: str, country: Optional[str], agency: RatingAgency
    ) -> List[str]:
        """
        Build multiple search dorks for better coverage.

        Args:
            company_name: Company name
            country: Optional country code
            agency: Rating agency

        Returns:
            List of search query strings
        """
        # Generate name variations
        variations = generate_name_variations(company_name)[:3]  # Top 3 variations

        dorks = []

        # Agency-specific search patterns
        if agency == RatingAgency.FITCH:
            base_sites = [
                'site:fitchratings.com',
                'site:fitchratings.com/entity',
            ]
            keywords = ['rating', 'issuer', 'credit']

        elif agency == RatingAgency.SP:
            base_sites = [
                'site:spglobal.com',
                'site:spglobal.com/ratings',
            ]
            keywords = ['rating', 'issuer credit', 'entity']

        else:  # MOODYS
            base_sites = [
                'site:moodys.com',
                'site:moodys.com/credit-ratings',
            ]
            keywords = ['rating', 'issuer', 'credit opinion']

        # Build queries
        for variation in variations:
            for site in base_sites[:2]:  # Limit to prevent too many queries
                # Primary query with exact match
                primary = f'{site} "{variation}"'
                if country:
                    primary += f' {country}'
                dorks.append(primary)

                # Secondary query with keywords
                for keyword in keywords[:1]:  # Just one keyword per variation
                    secondary = f'{site} {variation} {keyword}'
                    if country:
                        secondary += f' {country}'
                    dorks.append(secondary)

        # Limit total dorks
        return dorks[:6]

    async def resolve(
        self, company_name: str, country: Optional[str], agency: RatingAgency
    ) -> Optional[ResolvedEntity]:
        """
        Resolve company name with enhanced matching.

        Args:
            company_name: Company legal name
            country: Optional ISO country code
            agency: Target rating agency

        Returns:
            ResolvedEntity with best match or None
        """
        logger.info(
            "entity_resolution_start",
            company_name=company_name,
            country=country,
            agency=agency.value,
        )

        # Build multiple search dorks
        dorks = self._build_search_dorks(company_name, country, agency)

        all_candidates: List[Dict] = []

        # Try each dork
        for idx, dork in enumerate(dorks):
            try:
                candidates = await self._search_with_dork(dork, agency)
                all_candidates.extend(candidates)

                # Stop if we have enough good candidates
                if len(all_candidates) >= 10:
                    break

            except Exception as e:
                logger.warning(
                    "search_dork_failed",
                    dork_index=idx,
                    error=str(e),
                )
                continue

        if not all_candidates:
            logger.warning(
                "no_candidates_found",
                company_name=company_name,
                agency=agency.value,
                dorks_tried=len(dorks),
            )
            return None

        # Deduplicate by URL
        seen_urls: set = set()
        unique_candidates = []
        for candidate in all_candidates:
            url = candidate['url']
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
                    "name": candidate['title'],
                    "url": candidate['url'],
                    "confidence": round(score, 2),
                })

        entity = ResolvedEntity(
            name=best_candidate['title'],
            country=country,
            canonical_url=best_candidate['url'],
            confidence=round(best_score, 2),
            ambiguous_candidates=ambiguous,
        )

        logger.info(
            "entity_resolved",
            company_name=company_name,
            resolved_name=entity.name,
            confidence=entity.confidence,
            agency=agency.value,
            alternatives=len(ambiguous),
        )

        return entity

    async def _search_with_dork(
        self, dork: str, agency: RatingAgency
    ) -> List[Dict]:
        """
        Execute search with a specific dork.

        Args:
            dork: Search query
            agency: Rating agency

        Returns:
            List of candidate results
        """
        # Use DuckDuckGo HTML search
        search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(dork)}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            headers = {
                "User-Agent": self.settings.user_agent,
                "Accept": "text/html",
            }
            response = await client.get(search_url, headers=headers, follow_redirects=True)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")
        results = self._parse_search_results(soup, agency)

        logger.info(
            "search_results_parsed",
            dork=dork[:100],
            results_count=len(results),
            status_code=response.status_code,
        )

        return results

    def _parse_search_results(
        self, soup: BeautifulSoup, agency: RatingAgency
    ) -> List[Dict]:
        """Extract and filter search results."""
        results = []

        # Domain validation
        domain_checks = {
            RatingAgency.FITCH: "fitchratings.com",
            RatingAgency.SP: "spglobal.com",
            RatingAgency.MOODYS: "moodys.com",
        }

        required_domain = domain_checks[agency]

        # Parse DuckDuckGo results
        result_divs = soup.find_all("div", class_="result")
        logger.debug(
            "parsing_search_html",
            agency=agency.value,
            result_divs_found=len(result_divs),
        )

        for result_div in result_divs:
            title_elem = result_div.find("a", class_="result__a")
            if not title_elem:
                continue

            title = title_elem.get_text(strip=True)
            url = title_elem.get("href", "")

            # Validate domain
            if required_domain not in url:
                continue

            # Get snippet for additional context
            snippet_elem = result_div.find("a", class_="result__snippet")
            snippet = snippet_elem.get_text(strip=True) if snippet_elem else ""

            results.append({
                "title": title,
                "url": url,
                "snippet": snippet,
            })

        return results

    def _score_candidates(
        self,
        candidates: List[Dict],
        query_name: str,
        query_country: Optional[str],
    ) -> List[Tuple[float, Dict]]:
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
        candidate: Dict,
        query_name: str,
        query_country: Optional[str],
    ) -> float:
        """
        Calculate score for a single candidate.

        Scoring factors:
        - Name similarity (0-0.6)
        - Country match (0-0.15)
        - URL quality (0-0.15)
        - Snippet relevance (0-0.1)
        """
        score = 0.0
        title = candidate['title']
        url = candidate['url'].lower()
        snippet = candidate.get('snippet', '').lower()

        # 1. Name similarity (most important - up to 0.6)
        name_sim = calculate_name_similarity(title, query_name)
        score += name_sim * 0.6

        # 2. Country match (0.15)
        if query_country:
            country_lower = query_country.lower()
            if country_lower in title.lower() or country_lower in snippet:
                score += 0.15

        # 3. URL quality (0.15)
        url_score = 0.0

        # Prefer entity/issuer pages
        if any(keyword in url for keyword in ['entity', 'issuer', 'profile']):
            url_score += 0.1

        # Penalize press releases
        if any(keyword in url for keyword in ['press-release', 'news', 'article']):
            url_score -= 0.05

        # Prefer credit-ratings paths
        if 'credit-rating' in url or 'ratings' in url:
            url_score += 0.05

        score += max(0, url_score)

        # 4. Snippet relevance (0.1)
        if snippet:
            query_words = set(normalize_company_name(query_name).split())
            snippet_words = set(snippet.split())
            overlap = len(query_words & snippet_words) / max(len(query_words), 1)
            score += overlap * 0.1

        return max(0.0, min(1.0, score))

    def _log_top_candidates(
        self,
        scored_candidates: List[Tuple[float, Dict]],
        query_name: str,
    ) -> None:
        """Log top candidates for debugging."""
        if not scored_candidates:
            return

        logger.info(
            "top_candidates",
            query=query_name,
            count=len(scored_candidates),
            top_3=[
                {
                    "score": round(score, 3),
                    "title": candidate['title'][:80],
                    "url": candidate['url'][:100],
                }
                for score, candidate in scored_candidates[:3]
            ],
        )


def get_enhanced_entity_resolver() -> EnhancedEntityResolver:
    """Get enhanced entity resolver instance."""
    return EnhancedEntityResolver()
