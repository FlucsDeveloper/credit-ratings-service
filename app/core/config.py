"""Application configuration using pydantic-settings."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Server
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8000, description="Server port")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", description="Logging level"
    )

    # Scraping
    headless: bool = Field(default=True, description="Run browser in headless mode")
    max_concurrency: int = Field(default=2, description="Max concurrent scraping tasks")
    request_timeout: int = Field(default=30000, description="Request timeout in milliseconds")
    user_agent: str = Field(
        default="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        description="User agent for requests",
    )

    # Agency permissions
    scraping_allowed_fitch: bool = Field(default=True, description="Allow Fitch scraping")
    scraping_allowed_sp: bool = Field(default=True, description="Allow S&P scraping")
    scraping_allowed_moodys: bool = Field(default=True, description="Allow Moody's scraping")

    # Cache
    cache_ttl_days: int = Field(default=7, description="Cache TTL in days")
    cache_db_path: str = Field(default="./data/cache.db", description="SQLite cache database path")

    # Rate limiting
    rate_limit_per_domain: int = Field(
        default=10, description="Requests per domain in window"
    )
    rate_limit_window_seconds: int = Field(default=60, description="Rate limit window in seconds")
    circuit_breaker_threshold: int = Field(
        default=5, description="Failures before circuit breaks"
    )
    circuit_breaker_timeout_seconds: int = Field(
        default=300, description="Circuit breaker timeout"
    )

    # Search
    max_search_results: int = Field(default=5, description="Max search results to analyze")
    prefer_exact_match: bool = Field(
        default=True, description="Prefer exact company name matches"
    )

    # LLM Configuration
    llm_provider: Literal["groq", "gemini", "openai"] = Field(
        default="groq", description="LLM provider to use"
    )
    groq_api_key: str = Field(default="", description="Groq API key")
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    openai_api_key: str = Field(default="", description="OpenAI API key")
    llm_model: str = Field(
        default="llama-3.1-70b-versatile",
        description="LLM model to use (groq: llama-3.1-70b-versatile, gemini: gemini-1.5-flash)"
    )
    llm_temperature: float = Field(default=0.1, description="LLM temperature for responses")
    llm_max_tokens: int = Field(default=4000, description="Max tokens for LLM response")
    llm_timeout: int = Field(default=30, description="LLM timeout in seconds")


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
