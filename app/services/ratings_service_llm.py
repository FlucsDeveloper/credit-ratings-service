"""Enhanced Ratings Service with LLM entity resolution."""

import asyncio
from typing import Optional

from app.core.logging import get_logger
from app.models.enums import RatingAgency
from app.models.schemas import AgencyRating, RatingsResponse
from app.scrapers import FitchScraper, MoodysScraper, SPScraper
from app.services.cache import get_cache_service
from app.services.entity_resolver_llm import LLMEntityResolver

logger = get_logger(__name__)


class LLMRatingsService:
    """Ratings service using LLM for enhanced entity resolution."""

    def __init__(self) -> None:
        """Initialize LLM ratings service."""
        self.cache = get_cache_service()
        self.resolver = LLMEntityResolver()

        # Initialize scrapers
        self.scrapers = {
            RatingAgency.FITCH: FitchScraper(),
            RatingAgency.SP: SPScraper(),
            RatingAgency.MOODYS: MoodysScraper(),
        }

    async def get_ratings(
        self, company_name: str, country: Optional[str] = None
    ) -> RatingsResponse:
        """
        Get credit ratings with enhanced LLM entity resolution.

        Args:
            company_name: Company legal name
            country: Optional ISO country code

        Returns:
            RatingsResponse with aggregated ratings
        """
        logger.info(
            "llm_ratings_request",
            company_name=company_name,
            country=country
        )

        # Check cache first
        cached_result = await self.cache.get(company_name, country)
        if cached_result:
            logger.info("cache_hit", company_name=company_name)
            return cached_result

        # Initialize response
        response = RatingsResponse(
            query=company_name,
            ratings={},
            notes=["Using LLM-enhanced entity resolution"],
        )

        # Process each agency
        tasks = []
        for agency in RatingAgency:
            task = self._process_agency(company_name, country, agency)
            tasks.append((agency, task))

        # Wait for all agencies
        for agency, task in tasks:
            try:
                rating = await task
                if rating:
                    response.ratings[agency.value] = rating
                    logger.info(
                        "agency_rating_success",
                        company_name=company_name,
                        agency=agency.value,
                        rating=rating.dict()
                    )
            except Exception as e:
                logger.error(
                    "agency_processing_failed",
                    agency=agency.value,
                    error=str(e)
                )
                response.ratings[agency.value] = AgencyRating(
                    agency=agency,
                    error=f"Failed to process: {str(e)[:100]}"
                )

        # Cache successful results
        if any(r.raw for r in response.ratings.values()):
            await self.cache.set(company_name, country, response)

        # Clean up resolver
        await self.resolver.close()

        return response

    async def _process_agency(
        self,
        company_name: str,
        country: Optional[str],
        agency: RatingAgency
    ) -> Optional[AgencyRating]:
        """Process a single agency with LLM entity resolution."""
        try:
            # Resolve entity with LLM
            logger.info(
                "resolving_entity_llm",
                company_name=company_name,
                agency=agency.value
            )

            entity = await self.resolver.resolve(company_name, country, agency)

            if not entity:
                logger.warning(
                    "entity_not_resolved",
                    company_name=company_name,
                    agency=agency.value
                )
                return AgencyRating(
                    agency=agency,
                    error="Could not resolve entity"
                )

            # Log successful resolution
            logger.info(
                "entity_resolved",
                company_name=company_name,
                agency=agency.value,
                resolved_name=entity.resolved_name,
                confidence=entity.confidence
            )

            # Get scraper for agency
            scraper = self.scrapers[agency]

            # Scrape rating using resolved entity URL
            if entity.source_url:
                rating = await scraper.scrape_url(entity.source_url)
                if rating:
                    rating.resolved_name = entity.resolved_name
                    rating.confidence = entity.confidence
                    return rating

            # Fallback to search if no direct URL
            return await scraper.scrape(entity.resolved_name)

        except Exception as e:
            logger.error(
                "agency_processing_error",
                company_name=company_name,
                agency=agency.value,
                error=str(e)
            )
            return AgencyRating(
                agency=agency,
                error=f"Processing failed: {str(e)[:100]}"
            )