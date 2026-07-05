import express from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../services/database.js';
import { getCircuitBreakerStatus, resetCircuitBreaker } from '../services/llmGateway.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// Health check cache: avoid hammering Supabase on every uptime probe
let _healthCache = null;
let _healthCacheAt = 0;
const HEALTH_CACHE_TTL_MS = 30_000; // 30 seconds

// Per-probe timeout: a slow probe (e.g. exact count over a large table)
// degrades to partial status instead of holding the whole response.
const HEALTH_PROBE_TIMEOUT_MS = parseInt(process.env.HEALTH_PROBE_TIMEOUT_MS, 10) || 2000;
const PROBE_TIMED_OUT = Object.freeze({ timedOut: true });

/**
 * Race a probe against a timeout. Resolves with PROBE_TIMED_OUT on timeout
 * and with { error } on rejection — never throws, so Promise.all below
 * always settles.
 */
function probeWithTimeout(promise) {
  return Promise.race([
    Promise.resolve(promise).catch((e) => ({ error: { message: e.message } })),
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(PROBE_TIMED_OUT), HEALTH_PROBE_TIMEOUT_MS);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]);
}

// System health check endpoint (4A - Production Hardening)
// Returns basic health for uptime monitors; full details only for authenticated users
router.get('/', async (req, res) => {
  // Always available: basic health response for uptime monitors
  const basicHealth = { status: 'ok', uptime: Math.floor(process.uptime()) };

  // Check if caller is authenticated (Bearer token or cron secret)
  const authHeader = req.headers.authorization;
  let isAuthenticated = false;

  if (authHeader && authHeader.startsWith('Bearer ') && JWT_SECRET) {
    try {
      jwt.verify(authHeader.substring(7), JWT_SECRET, { algorithms: ['HS256'] });
      isAuthenticated = true;
    } catch {
      // Invalid token — fall through to basic response
    }
  }

  // Also accept cron secret for automated monitoring
  if (!isAuthenticated) {
    const cronResult = verifyCronSecret(req);
    if (cronResult.authorized) isAuthenticated = true;
  }

  // If not authenticated, return only basic health
  if (!isAuthenticated) {
    return res.json(basicHealth);
  }

  // --- Authenticated: return full detailed response ---

  // Return cached result if fresh enough
  if (_healthCache && (Date.now() - _healthCacheAt) < HEALTH_CACHE_TTL_MS) {
    return res.status(_healthCache.status === 'unhealthy' ? 503 : 200).json(_healthCache);
  }

  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: { connected: false },
    memoryStreamCount: 0,
    ingestionLastRun: null,
    llmCallsLastHour: 0,
    circuitBreaker: getCircuitBreakerStatus(),
  };

  // 1. Database connectivity gate — use user_memories (lighter; avoids users
  //    table churn). Timeout-guarded so a hanging DB yields 503, not a hung
  //    request.
  if (!supabaseAdmin) {
    checks.database.connected = false;
    checks.database.error = 'supabaseAdmin not initialized';
  } else {
    const ping = await probeWithTimeout(
      supabaseAdmin.from('user_memories').select('id').limit(1)
    );
    if (ping === PROBE_TIMED_OUT) {
      checks.database.connected = false;
      checks.database.error = `connectivity probe timed out after ${HEALTH_PROBE_TIMEOUT_MS}ms`;
    } else {
      checks.database.connected = !ping?.error;
      if (ping?.error) checks.database.error = ping.error.message;
    }
  }

  // If database is not connected, cache the unhealthy result and return 503
  if (!checks.database.connected) {
    checks.status = 'unhealthy';
    _healthCache = checks;
    _healthCacheAt = Date.now();
    return res.status(503).json(checks);
  }

  // 2-4. Detail probes in parallel (previously serial — the exact count over
  //      user_memories alone could take seconds). Each has its own timeout;
  //      timed-out probes keep their defaults and are listed in probeTimeouts.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [memResult, ingResult, llmResult] = await Promise.all([
    probeWithTimeout(
      supabaseAdmin
        .from('user_memories')
        .select('*', { count: 'exact', head: true })
    ),
    probeWithTimeout(
      supabaseAdmin
        .from('ingestion_health_log')
        .select('run_at, duration_ms, users_processed, observations_stored, errors')
        .order('run_at', { ascending: false })
        .limit(1)
        .single()
    ),
    probeWithTimeout(
      supabaseAdmin
        .from('llm_usage_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
    ),
  ]);

  if (memResult !== PROBE_TIMED_OUT && !memResult?.error) {
    checks.memoryStreamCount = memResult?.count || 0;
  }
  if (ingResult !== PROBE_TIMED_OUT && !ingResult?.error && ingResult?.data) {
    checks.ingestionLastRun = ingResult.data;
  }
  if (llmResult !== PROBE_TIMED_OUT && !llmResult?.error) {
    checks.llmCallsLastHour = llmResult?.count || 0;
  }

  const probeTimeouts = [
    memResult === PROBE_TIMED_OUT && 'memoryStreamCount',
    ingResult === PROBE_TIMED_OUT && 'ingestionLastRun',
    llmResult === PROBE_TIMED_OUT && 'llmCallsLastHour',
  ].filter(Boolean);
  if (probeTimeouts.length > 0) {
    checks.probeTimeouts = probeTimeouts; // partial status — probes exceeded HEALTH_PROBE_TIMEOUT_MS
  }

  _healthCache = checks;
  _healthCacheAt = Date.now();

  res.status(200).json(checks);
});

// LLM Circuit Breaker status (auth required — internal diagnostics, not for uptime monitors)
router.get('/circuit-breaker', authenticateUser, (req, res) => {
  res.json(getCircuitBreakerStatus());
});

// LLM Circuit Breaker manual reset (requires CRON_SECRET for safety)
router.post('/circuit-breaker/reset', (req, res) => {
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }
  const result = resetCircuitBreaker();
  res.json({ success: true, ...result });
});

export default router;
