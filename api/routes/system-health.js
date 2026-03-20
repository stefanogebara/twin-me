import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { getCircuitBreakerStatus, resetCircuitBreaker } from '../services/llmGateway.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';

const router = express.Router();

// Health check cache: avoid hammering Supabase on every uptime probe
let _healthCache = null;
let _healthCacheAt = 0;
const HEALTH_CACHE_TTL_MS = 30_000; // 30 seconds

// System health check endpoint (4A - Production Hardening)
// No auth required so uptime monitors (UptimeRobot, Vercel checks) can hit it
router.get('/', async (req, res) => {
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

  try {
    // 1. Database connectivity — use user_memories (lighter; avoids users table churn)
    if (!supabaseAdmin) {
      checks.database.connected = false;
      checks.database.error = 'supabaseAdmin not initialized';
    } else {
      const { error: dbError } = await supabaseAdmin
        .from('user_memories')
        .select('id')
        .limit(1);
      checks.database.connected = !dbError;
      if (dbError) checks.database.error = dbError.message;
    }
  } catch (e) {
    checks.database.connected = false;
    checks.database.error = e.message;
  }

  // If database is not connected, cache the unhealthy result and return 503
  if (!checks.database.connected) {
    checks.status = 'unhealthy';
    _healthCache = checks;
    _healthCacheAt = Date.now();
    return res.status(503).json(checks);
  }

  try {
    // 2. Memory stream count
    const { count, error: memError } = await supabaseAdmin
      .from('user_memories')
      .select('*', { count: 'exact', head: true });
    if (!memError) checks.memoryStreamCount = count || 0;

    // 3. Ingestion last-run
    const { data: lastRun, error: ingError } = await supabaseAdmin
      .from('ingestion_health_log')
      .select('run_at, duration_ms, users_processed, observations_stored, errors')
      .order('run_at', { ascending: false })
      .limit(1)
      .single();
    if (!ingError && lastRun) checks.ingestionLastRun = lastRun;

    // 4. LLM calls last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: llmCount, error: llmError } = await supabaseAdmin
      .from('llm_usage_log')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo);
    if (!llmError) checks.llmCallsLastHour = llmCount || 0;
  } catch (e) {
    // Non-fatal: database is connected but some queries failed
    checks.queryError = e.message;
  }

  _healthCache = checks;
  _healthCacheAt = Date.now();

  // In production, only return status + timestamp (no internal metrics)
  if (process.env.NODE_ENV === 'production') {
    return res.status(200).json({
      status: checks.status,
      timestamp: checks.timestamp,
    });
  }

  res.status(200).json(checks);
});

// LLM Circuit Breaker status (no auth — for uptime monitors)
router.get('/circuit-breaker', (req, res) => {
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
