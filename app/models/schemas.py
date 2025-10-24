"""Pydantic schemas for request/response models."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl

from app.models.enums import Outlook, RatingAgency, RatingBucket, RatingScale


class RatingRequest(BaseModel):
    """Request model for rating lookup."""

    company_name: str = Field(..., min_length=1, description="Company legal name")
    country: Optional[str] = Field(
        default=None, max_length=2, description="ISO 3166-1 alpha-2 country code (e.g., 'BR', 'US')"
    )
    prefer_exact_match: bool = Field(
        default=True, description="Prefer exact name matches over fuzzy matches"
    )


class ResolvedEntity(BaseModel):
    """Resolved company entity."""

    name: str = Field(..., description="Resolved canonical company name")
    country: Optional[str] = Field(default=None, description="Country code")
    canonical_url: Optional[HttpUrl] = Field(default=None, description="Primary source URL")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Match confidence score (0-1)")
    ambiguous_candidates: list[dict[str, str]] = Field(
        default_factory=list, description="Alternative matches if ambiguous"
    )


class NormalizedRating(BaseModel):
    """Normalized rating with standardized scale."""

    scale: RatingScale = Field(..., description="Rating scale system")
    score: int = Field(..., ge=1, le=21, description="Numeric score (1=best, 21=default)")
    bucket: RatingBucket = Field(..., description="Rating quality bucket")


class AgencyRating(BaseModel):
    """Rating from a single agency."""

    raw: Optional[str] = Field(default=None, description="Raw rating value (e.g., 'AA-', 'Baa2')")
    outlook: Optional[Outlook] = Field(default=None, description="Rating outlook")
    normalized: Optional[NormalizedRating] = Field(default=None, description="Normalized rating")
    last_updated: Optional[datetime] = Field(default=None, description="Last rating action date")
    source_url: Optional[HttpUrl] = Field(default=None, description="Source page URL")
    blocked: bool = Field(default=False, description="Whether scraping was blocked")
    error: Optional[str] = Field(default=None, description="Error message if failed")


class RatingsResponse(BaseModel):
    """Complete ratings response."""

    query: str = Field(..., description="Original company name query")
    resolved: Optional[ResolvedEntity] = Field(default=None, description="Resolved entity details")
    ratings: dict[RatingAgency, AgencyRating] = Field(
        default_factory=dict, description="Ratings by agency"
    )
    notes: list[str] = Field(default_factory=list, description="Additional notes or warnings")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Response timestamp")
    cached: bool = Field(default=False, description="Whether result was served from cache")
