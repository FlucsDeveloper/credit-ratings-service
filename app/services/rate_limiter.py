"""Rate limiting and circuit breaker for scraping services."""

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta
from enum import Enum
from typing import DefaultDict, Optional

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class CircuitState(Enum):
    """Circuit breaker states."""

    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Blocking requests
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreaker:
    """Circuit breaker pattern implementation for domains."""

    def __init__(self, domain: str, threshold: int, timeout_seconds: int):
        """
        Initialize circuit breaker.

        Args:
            domain: Domain name
            threshold: Number of failures before opening circuit
            timeout_seconds: Seconds to wait before testing recovery
        """
        self.domain = domain
        self.threshold = threshold
        self.timeout_seconds = timeout_seconds
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.success_count = 0

    def record_success(self) -> None:
        """Record successful request."""
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            # After 2 successes in half-open, close the circuit
            if self.success_count >= 2:
                self._close_circuit()
        elif self.state == CircuitState.CLOSED:
            self.failure_count = 0

    def record_failure(self) -> None:
        """Record failed request."""
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()

        if self.failure_count >= self.threshold:
            self._open_circuit()

    def can_request(self) -> tuple[bool, Optional[str]]:
        """
        Check if requests are allowed.

        Returns:
            (allowed, reason) tuple
        """
        if self.state == CircuitState.CLOSED:
            return True, None

        if self.state == CircuitState.OPEN:
            # Check if timeout has passed
            if (
                self.last_failure_time
                and datetime.utcnow() - self.last_failure_time
                > timedelta(seconds=self.timeout_seconds)
            ):
                self._half_open_circuit()
                return True, None

            return False, f"Circuit open for {self.domain} (too many failures)"

        # HALF_OPEN state
        return True, None

    def _open_circuit(self) -> None:
        """Open circuit breaker."""
        self.state = CircuitState.OPEN
        logger.warning(
            "circuit_opened",
            domain=self.domain,
            failure_count=self.failure_count,
            timeout=self.timeout_seconds,
        )

    def _half_open_circuit(self) -> None:
        """Transition to half-open state."""
        self.state = CircuitState.HALF_OPEN
        self.success_count = 0
        logger.info("circuit_half_open", domain=self.domain)

    def _close_circuit(self) -> None:
        """Close circuit breaker (normal operation)."""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        logger.info("circuit_closed", domain=self.domain)


class RateLimiter:
    """Token bucket rate limiter with circuit breakers."""

    def __init__(self) -> None:
        """Initialize rate limiter."""
        settings = get_settings()
        self.requests_per_domain = settings.rate_limit_per_domain
        self.window_seconds = settings.rate_limit_window_seconds
        self.circuit_threshold = settings.circuit_breaker_threshold
        self.circuit_timeout = settings.circuit_breaker_timeout_seconds

        # Per-domain tracking
        self.tokens: DefaultDict[str, int] = defaultdict(lambda: self.requests_per_domain)
        self.last_refill: DefaultDict[str, datetime] = defaultdict(datetime.utcnow)
        self.locks: DefaultDict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

        # Circuit breakers per domain
        self.circuits: dict[str, CircuitBreaker] = {}

    def _get_circuit(self, domain: str) -> CircuitBreaker:
        """Get or create circuit breaker for domain."""
        if domain not in self.circuits:
            self.circuits[domain] = CircuitBreaker(
                domain, self.circuit_threshold, self.circuit_timeout
            )
        return self.circuits[domain]

    async def acquire(self, domain: str) -> tuple[bool, Optional[str]]:
        """
        Acquire permission to make request to domain.

        Args:
            domain: Target domain

        Returns:
            (allowed, reason) tuple
        """
        circuit = self._get_circuit(domain)

        # Check circuit breaker first
        can_request, reason = circuit.can_request()
        if not can_request:
            return False, reason

        async with self.locks[domain]:
            # Refill tokens if window has passed
            now = datetime.utcnow()
            elapsed = (now - self.last_refill[domain]).total_seconds()

            if elapsed >= self.window_seconds:
                self.tokens[domain] = self.requests_per_domain
                self.last_refill[domain] = now

            # Check if tokens available
            if self.tokens[domain] <= 0:
                wait_time = self.window_seconds - elapsed
                return False, f"Rate limit exceeded for {domain}, retry in {wait_time:.1f}s"

            # Consume token
            self.tokens[domain] -= 1
            return True, None

    def record_success(self, domain: str) -> None:
        """Record successful request for circuit breaker."""
        circuit = self._get_circuit(domain)
        circuit.record_success()

    def record_failure(self, domain: str) -> None:
        """Record failed request for circuit breaker."""
        circuit = self._get_circuit(domain)
        circuit.record_failure()

    def get_status(self, domain: str) -> dict:
        """Get rate limiter status for domain."""
        circuit = self._get_circuit(domain)
        return {
            "domain": domain,
            "tokens_remaining": self.tokens[domain],
            "circuit_state": circuit.state.value,
            "failure_count": circuit.failure_count,
        }


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Get or create global rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter
