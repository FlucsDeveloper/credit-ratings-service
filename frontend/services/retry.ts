/**
 * Retry, timeout, and circuit breaker infrastructure
 * Implements resilience patterns for API calls
 */

import { RatingsError } from './types';

const RETRY_DELAYS = [200, 600, 1200]; // ms - exponential backoff
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIME = 60000; // 60s

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Check if circuit breaker is open for a given key
 */
export function isCircuitBreakerOpen(key: string): boolean {
  const breaker = circuitBreakers.get(key);
  if (!breaker) return false;

  // Reset if enough time has passed
  if (breaker.isOpen && Date.now() - breaker.lastFailure > CIRCUIT_BREAKER_RESET_TIME) {
    breaker.isOpen = false;
    breaker.failures = 0;
    console.log(`[CIRCUIT_BREAKER] ${key} reset after timeout`);
  }

  return breaker.isOpen;
}

/**
 * Record a failure for circuit breaker
 */
export function recordFailure(key: string): void {
  const breaker = circuitBreakers.get(key) || { failures: 0, lastFailure: 0, isOpen: false };

  breaker.failures++;
  breaker.lastFailure = Date.now();

  if (breaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    breaker.isOpen = true;
    console.log(`[CIRCUIT_BREAKER] ${key} opened after ${breaker.failures} failures`);
  }

  circuitBreakers.set(key, breaker);
}

/**
 * Record a success for circuit breaker (resets failures)
 */
export function recordSuccess(key: string): void {
  const breaker = circuitBreakers.get(key);
  if (breaker) {
    breaker.failures = 0;
    circuitBreakers.set(key, breaker);
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  attempt: number = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const isLastAttempt = attempt >= RETRY_DELAYS.length - 1;

    if (isLastAttempt) {
      throw error;
    }

    const delay = RETRY_DELAYS[attempt] + Math.random() * 100; // Add jitter
    console.log(`[RETRY] ${context} attempt ${attempt + 1} failed, retrying in ${delay}ms...`);

    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, context, attempt + 1);
  }
}

/**
 * Execute a function with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new RatingsError('TIMEOUT', `${context} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Execute with retry, timeout, and circuit breaker
 */
export async function executeWithResilience<T>(
  fn: () => Promise<T>,
  options: {
    context: string;
    circuitBreakerKey: string;
    timeoutMs: number;
  }
): Promise<T> {
  const { context, circuitBreakerKey, timeoutMs } = options;

  // Check circuit breaker
  if (isCircuitBreakerOpen(circuitBreakerKey)) {
    throw new RatingsError(
      'CIRCUIT_BREAKER_OPEN',
      `Circuit breaker is open for ${circuitBreakerKey}`,
      { circuitBreakerKey }
    );
  }

  try {
    const result = await retryWithBackoff(
      () => withTimeout(fn(), timeoutMs, context),
      context
    );
    recordSuccess(circuitBreakerKey);
    return result;
  } catch (error) {
    recordFailure(circuitBreakerKey);
    throw error;
  }
}
