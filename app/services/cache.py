"""SQLite-based caching service for rating results."""

import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import aiosqlite

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.schemas import RatingsResponse

logger = get_logger(__name__)


class CacheService:
    """Async SQLite cache for rating responses."""

    def __init__(self) -> None:
        """Initialize cache service."""
        settings = get_settings()
        self.db_path = settings.cache_db_path
        self.ttl_days = settings.cache_ttl_days
        self._initialized = False

    async def initialize(self) -> None:
        """Create database and tables if they don't exist."""
        if self._initialized:
            return

        # Ensure directory exists
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS ratings_cache (
                    cache_key TEXT PRIMARY KEY,
                    company_name TEXT NOT NULL,
                    country TEXT,
                    response_data TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    expires_at TIMESTAMP NOT NULL
                )
                """
            )
            await db.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_expires_at
                ON ratings_cache(expires_at)
                """
            )
            await db.commit()

        self._initialized = True
        logger.info("cache_initialized", db_path=self.db_path)

    @staticmethod
    def _generate_cache_key(company_name: str, country: Optional[str]) -> str:
        """Generate deterministic cache key from query parameters."""
        key_data = f"{company_name.lower().strip()}:{country or ''}"
        return hashlib.sha256(key_data.encode()).hexdigest()

    async def get(
        self, company_name: str, country: Optional[str] = None
    ) -> Optional[RatingsResponse]:
        """
        Retrieve cached rating response.

        Args:
            company_name: Company name
            country: Optional country code

        Returns:
            Cached RatingsResponse or None if not found/expired
        """
        await self.initialize()

        cache_key = self._generate_cache_key(company_name, country)
        now = datetime.utcnow()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                async with db.execute(
                    """
                    SELECT response_data, expires_at
                    FROM ratings_cache
                    WHERE cache_key = ?
                    """,
                    (cache_key,),
                ) as cursor:
                    row = await cursor.fetchone()

                    if not row:
                        logger.debug("cache_miss", cache_key=cache_key)
                        return None

                    response_json, expires_at_str = row
                    expires_at = datetime.fromisoformat(expires_at_str)

                    # Check if expired
                    if expires_at < now:
                        logger.debug("cache_expired", cache_key=cache_key)
                        await self._delete_key(cache_key)
                        return None

                    # Deserialize and return
                    response_dict = json.loads(response_json)
                    response = RatingsResponse(**response_dict)
                    response.cached = True

                    logger.info(
                        "cache_hit",
                        cache_key=cache_key,
                        company_name=company_name,
                        ttl_remaining=(expires_at - now).days,
                    )
                    return response

        except Exception as e:
            logger.error("cache_get_error", error=str(e), cache_key=cache_key)
            return None

    async def set(
        self, company_name: str, country: Optional[str], response: RatingsResponse
    ) -> None:
        """
        Store rating response in cache.

        Args:
            company_name: Company name
            country: Optional country code
            response: Rating response to cache
        """
        await self.initialize()

        cache_key = self._generate_cache_key(company_name, country)
        now = datetime.utcnow()
        expires_at = now + timedelta(days=self.ttl_days)

        try:
            # Serialize response (ensure cached flag is false for storage)
            response.cached = False
            response_json = response.model_dump_json()

            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    INSERT OR REPLACE INTO ratings_cache
                    (cache_key, company_name, country, response_data, created_at, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (cache_key, company_name, country, response_json, now, expires_at),
                )
                await db.commit()

            logger.info(
                "cache_set",
                cache_key=cache_key,
                company_name=company_name,
                ttl_days=self.ttl_days,
            )

        except Exception as e:
            logger.error("cache_set_error", error=str(e), cache_key=cache_key)

    async def _delete_key(self, cache_key: str) -> None:
        """Delete a specific cache entry."""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("DELETE FROM ratings_cache WHERE cache_key = ?", (cache_key,))
                await db.commit()
        except Exception as e:
            logger.error("cache_delete_error", error=str(e), cache_key=cache_key)

    async def cleanup_expired(self) -> int:
        """
        Remove all expired cache entries.

        Returns:
            Number of entries deleted
        """
        await self.initialize()
        now = datetime.utcnow()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(
                    "DELETE FROM ratings_cache WHERE expires_at < ?", (now,)
                )
                deleted = cursor.rowcount
                await db.commit()

            if deleted > 0:
                logger.info("cache_cleanup", deleted_count=deleted)

            return deleted

        except Exception as e:
            logger.error("cache_cleanup_error", error=str(e))
            return 0

    async def clear_all(self) -> None:
        """Clear entire cache (for testing/maintenance)."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("DELETE FROM ratings_cache")
                await db.commit()

            logger.warning("cache_cleared")

        except Exception as e:
            logger.error("cache_clear_error", error=str(e))


# Global cache instance
_cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """Get or create global cache service instance."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service
