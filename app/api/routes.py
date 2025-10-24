"""API routes for credit ratings service."""

from fastapi import APIRouter, HTTPException, status

from app.core.logging import get_logger
from app.models.schemas import RatingRequest, RatingsResponse
from app.services.ratings_service import get_ratings_service

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/ratings",
    response_model=RatingsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get credit ratings for a company",
    description="""
    Fetch credit ratings from Fitch, S&P Global, and Moody's for a given company.

    The service will:
    1. Resolve the company name to entities across rating agencies
    2. Scrape public rating information from each agency
    3. Normalize ratings to a common scale
    4. Return aggregated results with metadata

    Results are cached for 7 days by default.
    """,
)
async def get_ratings(request: RatingRequest) -> RatingsResponse:
    """
    Get credit ratings for a company.

    Args:
        request: Rating request with company name and optional country

    Returns:
        Aggregated ratings from all agencies

    Raises:
        HTTPException: If request is invalid or service error occurs
    """
    try:
        logger.info(
            "api_ratings_request",
            company_name=request.company_name,
            country=request.country,
        )

        service = get_ratings_service()
        response = await service.get_ratings(
            company_name=request.company_name,
            country=request.country,
            prefer_exact_match=request.prefer_exact_match,
        )

        return response

    except Exception as e:
        logger.error(
            "api_ratings_error",
            company_name=request.company_name,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch ratings: {str(e)}",
        )


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Health check endpoint",
)
async def health_check() -> dict:
    """
    Health check endpoint.

    Returns:
        Status information
    """
    return {"status": "healthy", "service": "credit-ratings"}
