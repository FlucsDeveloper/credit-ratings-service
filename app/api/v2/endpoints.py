"""API v2 endpoints with LLM-based credit score extraction."""

from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field, HttpUrl

from app.core.logging import get_logger
from app.scrapers.llm_scraper import UniversalLLMScraper, LLMScraper
from app.models.enums import RatingAgency
from app.services.llm_client import CreditScoreData

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v2", tags=["ratings-v2"])


class CreditScoreRequest(BaseModel):
    """Request model for credit score extraction."""

    url: HttpUrl = Field(..., description="URL to extract credit score from")
    company_name: Optional[str] = Field(None, description="Company name hint for better extraction")
    wait_selector: Optional[str] = Field(None, description="CSS selector to wait for before extraction")


class CreditScoreResponse(BaseModel):
    """Response model for credit score extraction."""

    success: bool = Field(..., description="Whether extraction was successful")
    data: Optional[CreditScoreData] = Field(None, description="Extracted credit score data")
    error: Optional[str] = Field(None, description="Error message if extraction failed")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Response timestamp")


class MultiSourceRequest(BaseModel):
    """Request model for multi-source credit score extraction."""

    company_name: str = Field(..., description="Company name to search for")
    sources: Optional[list[str]] = Field(
        default=["fitch", "sp", "moodys"],
        description="Rating sources to query"
    )
    urls: Optional[Dict[str, str]] = Field(
        default={},
        description="Specific URLs for each source (optional)"
    )


class MultiSourceResponse(BaseModel):
    """Response model for multi-source extraction."""

    company: str = Field(..., description="Company name")
    scores: Dict[str, CreditScoreData] = Field(default={}, description="Scores by source")
    summary: Optional[Dict[str, Any]] = Field(None, description="Summary statistics")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Response timestamp")


@router.post("/extract", response_model=CreditScoreResponse)
async def extract_credit_score(request: CreditScoreRequest = Body(...)):
    """
    Extract credit score from any URL using LLM.

    This endpoint uses AI to dynamically extract credit score information
    from web pages without hardcoded selectors.

    Features:
    - Works with any credit rating website
    - Automatically identifies and extracts scores
    - Validates extracted data
    - Returns structured information
    """
    scraper = UniversalLLMScraper()

    try:
        logger.info(
            "api_v2_extract_start",
            url=str(request.url),
            company=request.company_name
        )

        # Extract credit score
        data = await scraper.scrape_url(
            url=str(request.url),
            company_name=request.company_name,
            wait_selector=request.wait_selector
        )

        # Check if extraction was successful
        success = data.confidence > 0.3 and (
            data.score is not None or
            data.rating is not None
        )

        if not success:
            error_msg = data.extraction_notes or "No credit score found"
            logger.warning(
                "api_v2_extract_no_data",
                url=str(request.url),
                confidence=data.confidence,
                error=error_msg
            )
            return CreditScoreResponse(
                success=False,
                data=data,
                error=error_msg
            )

        logger.info(
            "api_v2_extract_success",
            url=str(request.url),
            score=data.score,
            rating=data.rating,
            confidence=data.confidence
        )

        return CreditScoreResponse(
            success=True,
            data=data,
            error=None
        )

    except Exception as e:
        logger.error(
            "api_v2_extract_error",
            url=str(request.url),
            error=str(e)
        )
        return CreditScoreResponse(
            success=False,
            data=None,
            error=f"Extraction failed: {str(e)}"
        )

    finally:
        await scraper.close()


@router.post("/extract/multi", response_model=MultiSourceResponse)
async def extract_multi_source(request: MultiSourceRequest = Body(...)):
    """
    Extract credit scores from multiple rating agencies.

    Aggregates credit scores from multiple sources for a given company.
    Can use default agency URLs or custom provided URLs.
    """
    scores = {}
    scrapers = []

    try:
        # Process each source
        for source in request.sources:
            source_lower = source.lower()

            # Get URL for source
            if source_lower in request.urls:
                url = request.urls[source_lower]
                # Use universal scraper for custom URLs
                scraper = UniversalLLMScraper()
                scrapers.append(scraper)

                try:
                    data = await scraper.scrape_url(
                        url=url,
                        company_name=request.company_name
                    )
                    scores[source_lower] = data
                except Exception as e:
                    logger.error(
                        "multi_source_error",
                        source=source,
                        error=str(e)
                    )
                    scores[source_lower] = CreditScoreData(
                        confidence=0.0,
                        extraction_notes=f"Failed: {str(e)}"
                    )

            else:
                # Use agency-specific scraper
                agency_map = {
                    "fitch": RatingAgency.FITCH,
                    "sp": RatingAgency.SP,
                    "moodys": RatingAgency.MOODYS,
                }

                if source_lower in agency_map:
                    agency = agency_map[source_lower]
                    scraper = LLMScraper(agency)

                    # Note: This would need entity resolution to get the URL
                    # For now, we'll skip if no URL provided
                    scores[source_lower] = CreditScoreData(
                        confidence=0.0,
                        extraction_notes="URL required for this source"
                    )

        # Calculate summary statistics
        summary = _calculate_summary(scores)

        return MultiSourceResponse(
            company=request.company_name,
            scores=scores,
            summary=summary
        )

    finally:
        # Clean up scrapers
        for scraper in scrapers:
            if hasattr(scraper, 'close'):
                await scraper.close()


@router.get("/health")
async def health_check():
    """Health check endpoint for v2 API."""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "features": ["llm_extraction", "multi_source", "universal_scraping"],
        "timestamp": datetime.utcnow().isoformat()
    }


def _calculate_summary(scores: Dict[str, CreditScoreData]) -> Dict[str, Any]:
    """Calculate summary statistics from multiple scores."""
    valid_scores = []
    ratings = []
    outlooks = []
    confidences = []

    for source, data in scores.items():
        if data.score is not None:
            valid_scores.append(data.score)
        if data.rating:
            ratings.append(data.rating)
        if data.outlook:
            outlooks.append(data.outlook)
        if data.confidence > 0:
            confidences.append(data.confidence)

    summary = {
        "sources_checked": len(scores),
        "sources_with_data": len(valid_scores),
        "average_confidence": sum(confidences) / len(confidences) if confidences else 0.0,
    }

    if valid_scores:
        summary.update({
            "average_score": sum(valid_scores) / len(valid_scores),
            "min_score": min(valid_scores),
            "max_score": max(valid_scores),
            "score_variance": max(valid_scores) - min(valid_scores),
        })

    if ratings:
        summary["ratings"] = list(set(ratings))

    if outlooks:
        # Most common outlook
        outlook_counts = {}
        for outlook in outlooks:
            outlook_counts[outlook] = outlook_counts.get(outlook, 0) + 1
        summary["consensus_outlook"] = max(outlook_counts, key=outlook_counts.get)

    return summary