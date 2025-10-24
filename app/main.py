"""Main application entry point."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.api.v2.endpoints import router as v2_router
from app.api.v3_endpoints import router as v3_router
from app.core.config import get_settings
from app.core.logging import get_logger, setup_logging
from app.services.cache import get_cache_service
from app.services.ratings_service import get_ratings_service

settings = get_settings()
setup_logging(settings.log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("application_startup", version="0.1.0")

    # Initialize cache
    cache = get_cache_service()
    await cache.initialize()

    # Clean up expired cache entries
    deleted = await cache.cleanup_expired()
    if deleted > 0:
        logger.info("startup_cache_cleanup", deleted=deleted)

    yield

    # Shutdown
    logger.info("application_shutdown")

    # Close scrapers
    service = get_ratings_service()
    await service.close()


# Create FastAPI application
app = FastAPI(
    title="Credit Ratings Service",
    description="""
    Microservice for aggregating public credit ratings from Fitch, S&P Global, and Moody's.

    Features:
    - Entity resolution and disambiguation
    - Web scraping with rate limiting and circuit breakers
    - Rating normalization across agencies
    - SQLite-based caching (7-day TTL)
    - Structured logging

    This service respects robots.txt and does not bypass authentication or paywalls.
    """,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api/v1")
app.include_router(v2_router)  # v2 routes with LLM extraction
app.include_router(v3_router)  # v3 routes with enhanced LLM entity resolution

# Mount static files
frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir / "static")), name="static")

    @app.get("/")
    async def serve_frontend():
        """Serve frontend application."""
        return FileResponse(str(frontend_dir / "index.html"))
else:
    @app.get("/")
    async def root():
        """Root endpoint."""
        return {
            "service": "credit-ratings",
            "version": "0.3.0",
            "docs": "/docs",
            "health": "/api/v1/health",
            "v2_health": "/api/v2/health",
            "v3_health": "/api/v3/health",
            "features": {
                "v1": "Traditional CSS selector-based scraping",
                "v2": "LLM-based intelligent extraction",
                "v3": "Enhanced LLM entity resolution with intelligent name matching"
            }
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        reload=False,
    )
