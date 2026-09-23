/**
 * Lightweight circuit breaker for database connectivity.
 *
 * Tracks consecutive DB failures. When the failure threshold is reached,
 * the circuit opens and subsequent DB-dependent requests get a fast 503
 * instead of waiting 30-40s for Supabase/Cloudflare to time out.
 *
 * States: CLOSED (normal) → OPEN (fast-fail) → HALF_OPEN (probe)
 */
import { createLogger } from '../services/logger.js';

const log = createLogger('CircuitBreaker');

// Circuit state (module-level singleton)
let state = 'CLOSED';       // CLOSED | OPEN | HALF_OPEN
let failures = 0;
let lastFailureAt = 0;
let lastStateChange = Date.now();

// Tunables
const FAILURE_THRESHOLD = 3;       // consecutive failures to trip
const RECOVERY_TIMEOUT_MS = 30000; // 30s before trying again (HALF_OPEN)
const HEALTH_PATH = '/api/health'; // exempt from circuit breaker

/**
 * Record a DB failure. Called from the response sanitizer or route-level error handlers.
 */
export function recordFailure() {
  failures += 1;
  lastFailureAt = Date.now();
  if (failures >= FAILURE_THRESHOLD && state === 'CLOSED') {
    state = 'OPEN';
    lastStateChange = Date.now();
    log.warn(`Circuit OPEN after ${failures} consecutive DB failures`);
  }
}

/**
 * Record a successful DB operation. Resets the circuit.
 */
export function recordSuccess() {
  if (state !== 'CLOSED') {
    log.info(`Circuit CLOSED — DB recovered`);
  }
  failures = 0;
  state = 'CLOSED';
  lastStateChange = Date.now();
}

/**
 * Get current circuit state (for health endpoints).
 */
export function getCircuitState() {
  return { state, failures, lastFailureAt, lastStateChange };
}

/**
 * Express middleware — fast-fails DB-dependent requests when circuit is OPEN.
 * Health and static endpoints are always allowed through.
 */
export function circuitBreakerMiddleware(req, res, next) {
  // Always allow health checks, static assets, and auth routes through
  if (
    req.path === HEALTH_PATH ||
    req.path === '/api/system/health' ||
    req.path.startsWith('/api/auth/') ||
    req.method === 'OPTIONS'
  ) {
    return next();
  }

  if (state === 'OPEN') {
    const elapsed = Date.now() - lastStateChange;
    if (elapsed > RECOVERY_TIMEOUT_MS) {
      // Transition to HALF_OPEN — let one request through to probe
      state = 'HALF_OPEN';
      lastStateChange = Date.now();
      log.info('Circuit HALF_OPEN — allowing probe request');
      return next();
    }

    // Fast-fail
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable — database connection issues',
      retryAfterMs: RECOVERY_TIMEOUT_MS - elapsed,
    });
  }

  // CLOSED or HALF_OPEN — let request through
  next();
}
