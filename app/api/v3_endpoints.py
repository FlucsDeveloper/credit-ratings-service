"""API v3 endpoints with enhanced LLM entity resolution."""

from typing import Optional

from fastapi import APIRouter, HTTPException, status

from app.core.logging import get_logger
from app.models.schemas import RatingRequest, RatingsResponse
from app.services.ratings_service_llm import LLMRatingsService

logger = get_logger(__name__)
router = APIRouter(prefix="/api/v3", tags=["v3", "llm-enhanced"])

# Initialize service
ratings_service = LLMRatingsService()


@router.post("/ratings", response_model=RatingsResponse)
async def get_ratings(request: RatingRequest) -> RatingsResponse:
    """
    Get credit ratings using enhanced LLM entity resolution.

    This endpoint uses AI to intelligently match company names across agencies,
    even when names vary slightly or use different formats.
    """
    try:
        logger.info(
            "v3_api_ratings_request",
            company_name=request.company_name,
            country=request.country
        )

        result = await ratings_service.get_ratings(
            company_name=request.company_name,
            country=request.country
        )

        return result

    except Exception as e:
        logger.error(
            "v3_api_error",
            error=str(e),
            company_name=request.company_name
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch ratings: {str(e)}"
        )


@router.get("/health")
async def health_check():
    """Health check for v3 API."""
    return {
        "status": "healthy",
        "version": "3.0.0",
        "features": ["LLM entity resolution", "Intelligent name matching", "Multi-variation search"]
    }