"""Main ratings service orchestrating entity resolution and scraping."""

import asyncio
from typing import Optional

from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import AgencyRating, RatingsResponse, ResolvedEntity
from app.scrapers import FitchScraper, MoodysScraper, SPScraper
from app.services.cache import get_cache_service
from app.services.entity_resolver_v3 import get_direct_agency_resolver

logger = get_logger(__name__)


class RatingsService:
    """Main service for fetching and aggregating credit ratings."""

    def __init__(self) -> None:
        """Initialize ratings service."""
        self.cache = get_cache_service()
        self.resolver = get_direct_agency_resolver()

        # Initialize scrapers
        self.scrapers = {
            RatingAgency.FITCH: FitchScraper(),
            RatingAgency.SP: SPScraper(),
            RatingAgency.MOODYS: MoodysScraper(),
        }

    async def get_ratings(
        self, company_name: str, country: Optional[str] = None, prefer_exact_match: bool = True
    ) -> RatingsResponse:
        """
        Get credit ratings for a company from all agencies.

        Args:
            company_name: Company legal name
            country: Optional ISO country code
            prefer_exact_match: Prefer exact name matches

        Returns:
            RatingsResponse with aggregated ratings
        """
        logger.info("ratings_request", company_name=company_name, country=country)

        # Check cache first
        cached_result = await self.cache.get(company_name, country)
        if cached_result:
            logger.info("cache_hit", company_name=company_name)
            return cached_result

        # Initialize response
        response = RatingsResponse(
            query=company_name,
            ratings={},
            notes=[],
        )

        # Resolve entities for each agency (in parallel)
        resolution_tasks = []
        for agency in RatingAgency:
            task = self.resolver.resolve(company_name, country, agency)
            resolution_tasks.append((agency, task))

        # Wait for all resolutions
        resolved_entities = {}
        for agency, task in resolution_tasks:
            try:
                entity = await task
                resolved_entities[agency] = entity
            except Exception as e:
                logger.error("resolution_failed", agency=agency.value, error=str(e))
                resolved_entities[agency] = None

        # Pick the best resolved entity for response (prefer highest confidence)
        best_entity = self._select_best_entity(resolved_entities)
        response.resolved = best_entity

        # Scrape ratings from each agency (in parallel)
        scraping_tasks = []
        for agency, entity in resolved_entities.items():
            if entity and entity.canonical_url:
                task = self._scrape_agency(agency, str(entity.canonical_url))
                scraping_tasks.append((agency, task))
            else:
                # If resolution failed, return empty rating with error
                response.ratings[agency] = AgencyRating(
                    error=f"Could not resolve entity for {agency.value}"
                )

        # Wait for all scraping tasks
        for agency, task in scraping_tasks:
            try:
                rating = await task
                response.ratings[agency] = rating
            except Exception as e:
                logger.error("scraping_failed", agency=agency.value, error=str(e))
                response.ratings[agency] = AgencyRating(error=f"Scraping error: {str(e)}")

        # Add notes based on results
        response.notes = self._generate_notes(response)

        # Cache the result
        await self.cache.set(company_name, country, response)

        logger.info(
            "ratings_completed",
            company_name=company_name,
            success_count=sum(1 for r in response.ratings.values() if r.raw is not None),
        )

        return response

    def _select_best_entity(
        self, entities: dict[RatingAgency, Optional[ResolvedEntity]]
    ) -> Optional[ResolvedEntity]:
        """
        Select the best resolved entity from multiple agencies.

        Args:
            entities: Dict of resolved entities by agency

        Returns:
            Entity with highest confidence or None
        """
        valid_entities = [e for e in entities.values() if e is not None]

        if not valid_entities:
            return None

        # Sort by confidence descending
        valid_entities.sort(key=lambda e: e.confidence, reverse=True)
        return valid_entities[0]

    async def _scrape_agency(self, agency: RatingAgency, url: str) -> AgencyRating:
        """
        Scrape rating from specific agency.

        Args:
            agency: Rating agency
            url: Entity URL

        Returns:
            AgencyRating result
        """
        scraper = self.scrapers[agency]
        return await scraper.scrape(url)

    def _generate_notes(self, response: RatingsResponse) -> list[str]:
        """
        Generate informational notes based on response.

        Args:
            response: Ratings response

        Returns:
            List of note strings
        """
        notes = []

        # Check for blocked agencies
        blocked_agencies = [
            agency.value for agency, rating in response.ratings.items() if rating.blocked
        ]
        if blocked_agencies:
            notes.append(
                f"Scraping blocked for: {', '.join(blocked_agencies)}. "
                "This may be due to rate limits or access restrictions."
            )

        # Check for ambiguous resolution
        if response.resolved and response.resolved.ambiguous_candidates:
            count = len(response.resolved.ambiguous_candidates)
            notes.append(
                f"Found {count} alternative matches. "
                f"Confidence in selected entity: {response.resolved.confidence}."
            )

        # Check for missing ratings
        missing = [
            agency.value
            for agency, rating in response.ratings.items()
            if not rating.raw and not rating.blocked
        ]
        if missing:
            notes.append(f"No rating found for: {', '.join(missing)}.")

        # Check for low confidence resolution
        if response.resolved and response.resolved.confidence < 0.7:
            notes.append(
                f"Low confidence match ({response.resolved.confidence}). "
                "Please verify the entity is correct."
            )

        return notes

    async def close(self) -> None:
        """Close all scraper resources."""
        for scraper in self.scrapers.values():
            await scraper.close()


# Global service instance
_ratings_service: Optional[RatingsService] = None


def get_ratings_service() -> RatingsService:
    """Get or create global ratings service instance."""
    global _ratings_service
    if _ratings_service is None:
        _ratings_service = RatingsService()
    return _ratings_service
