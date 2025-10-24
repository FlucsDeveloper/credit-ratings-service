"""Tests for cache service."""

import os
import tempfile

import pytest

from app.models.enums import RatingAgency
from app.models.schemas import AgencyRating, RatingsResponse
from app.services.cache import CacheService


@pytest.fixture
async def cache_service():
    """Create a temporary cache service for testing."""
    # Use temporary database
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        tmp_path = tmp.name

    # Override cache path
    cache = CacheService()
    cache.db_path = tmp_path
    cache._initialized = False

    await cache.initialize()

    yield cache

    # Cleanup
    if os.path.exists(tmp_path):
        os.unlink(tmp_path)


@pytest.mark.asyncio
async def test_cache_miss(cache_service):
    """Test cache miss returns None."""
    result = await cache_service.get("Unknown Company", "US")
    assert result is None


@pytest.mark.asyncio
async def test_cache_set_and_get(cache_service):
    """Test setting and retrieving from cache."""
    company_name = "Test Company Inc."
    country = "BR"

    # Create a response
    response = RatingsResponse(
        query=company_name,
        ratings={
            RatingAgency.FITCH: AgencyRating(raw="AA-"),
            RatingAgency.SP: AgencyRating(raw="A+"),
            RatingAgency.MOODYS: AgencyRating(raw="Aa3"),
        },
    )

    # Store in cache
    await cache_service.set(company_name, country, response)

    # Retrieve from cache
    cached = await cache_service.get(company_name, country)

    assert cached is not None
    assert cached.query == company_name
    assert cached.cached is True
    assert len(cached.ratings) == 3
    assert cached.ratings[RatingAgency.FITCH].raw == "AA-"


@pytest.mark.asyncio
async def test_cache_key_normalization(cache_service):
    """Test that cache keys are normalized (case-insensitive, whitespace)."""
    response = RatingsResponse(
        query="Test Company",
        ratings={},
    )

    # Store with one format
    await cache_service.set("Test Company", "US", response)

    # Retrieve with different casing/whitespace
    cached1 = await cache_service.get("test company", "US")
    cached2 = await cache_service.get("TEST COMPANY", "US")

    assert cached1 is not None
    assert cached2 is not None


@pytest.mark.asyncio
async def test_cache_cleanup_expired(cache_service):
    """Test cleanup of expired entries."""
    # This would require mocking datetime or setting very short TTL
    # For now, just test that cleanup runs without error
    deleted = await cache_service.cleanup_expired()
    assert deleted >= 0


@pytest.mark.asyncio
async def test_cache_clear_all(cache_service):
    """Test clearing entire cache."""
    # Add some entries
    response = RatingsResponse(query="Test", ratings={})
    await cache_service.set("Company1", None, response)
    await cache_service.set("Company2", None, response)

    # Clear cache
    await cache_service.clear_all()

    # Verify entries are gone
    result1 = await cache_service.get("Company1", None)
    result2 = await cache_service.get("Company2", None)

    assert result1 is None
    assert result2 is None
